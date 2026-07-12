#!/usr/bin/env Rscript
#
# Time-to-Event (Survival) Sample Size Calculator for Clinical Trial Design
#
# Calculates sample size for survival endpoints using the Schoenfeld formula
# for required events, with optional exponential model for event probability.
# Supports superiority and non-inferiority designs.
# Drop-in alternative to survival_sample_size.py -- identical CLI and JSON output.
#

# Check for jsonlite
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

calculate_survival_sample_size <- function(
    hr,
    event_prob = NULL,
    median_control = NULL,
    follow_up = NULL,
    accrual = NULL,
    alpha = 0.05,
    power = 0.80,
    allocation_ratio = 1.0,
    dropout_rate = 0.15,
    design = "superiority"
) {
  # Validate HR
  if (hr <= 0 || hr == 1.0) {
    return(list(error = "Hazard ratio must be positive and not equal to 1"))
  }

  # Determine sidedness
  if (design == "superiority") {
    alpha_adj <- alpha / 2  # Two-sided test
    sidedness <- "two-sided"
  } else {  # non-inferiority
    alpha_adj <- alpha  # One-sided test
    sidedness <- "one-sided"
  }

  r <- allocation_ratio

  # Z-scores for alpha and beta
  z_alpha <- qnorm(1 - alpha_adj)
  z_beta <- qnorm(power)

  # Schoenfeld formula for required events
  if (r == 1.0) {
    k <- 4
  } else {
    k <- (1 + r)^2 / r
  }

  d <- as.integer(ceiling((z_alpha + z_beta)^2 / (log(hr)^2) * k))

  # Compute event probability
  if (!is.null(event_prob)) {
    prob_event <- event_prob
    event_method <- "user_specified"
    lambda_control_val <- NULL
    lambda_treatment_val <- NULL
  } else {
    # Exponential model
    lambda_control_val <- log(2) / median_control
    lambda_treatment_val <- lambda_control_val * hr

    if (!is.null(accrual)) {
      # Average survival over uniform accrual
      s_avg <- function(lam, fu, acc) {
        (1.0 / (acc * lam)) * (exp(-lam * fu) - exp(-lam * (fu + acc)))
      }
      s_control <- s_avg(lambda_control_val, follow_up, accrual)
      s_treatment <- s_avg(lambda_treatment_val, follow_up, accrual)
    } else {
      s_control <- exp(-lambda_control_val * follow_up)
      s_treatment <- exp(-lambda_treatment_val * follow_up)
    }

    # Combined event probability (allocation-weighted)
    prob_event <- 1.0 - s_control^(1.0 / (1.0 + r)) * s_treatment^(r / (1.0 + r))
    event_method <- "exponential_model"
  }

  # Events to patients
  N <- as.integer(ceiling(d / prob_event))
  n_treatment <- as.integer(ceiling(N * r / (1 + r)))
  n_control <- as.integer(N - n_treatment)
  events_treatment <- as.integer(ceiling(d * r / (1 + r)))
  events_control <- as.integer(d - events_treatment)

  # Adjust for dropout
  total_with_dropout <- as.integer(ceiling(N / (1 - dropout_rate)))
  treatment_with_dropout <- as.integer(ceiling(n_treatment / (1 - dropout_rate)))
  control_with_dropout <- as.integer(ceiling(n_control / (1 - dropout_rate)))

  # --- Sensitivity analysis: 90% power ---
  z_beta_90 <- qnorm(0.90)
  d_90 <- as.integer(ceiling((z_alpha + z_beta_90)^2 / (log(hr)^2) * k))
  N_90 <- as.integer(ceiling(d_90 / prob_event))
  total_90_dropout <- as.integer(ceiling(N_90 / (1 - dropout_rate)))

  # --- Sensitivity analysis: HR 10% toward null ---
  hr_sens <- hr + (1.0 - hr) * 0.1

  d_sens <- as.integer(ceiling((z_alpha + z_beta)^2 / (log(hr_sens)^2) * k))

  # Recompute prob_event if using exponential model
  if (event_method == "exponential_model") {
    lambda_treatment_sens <- lambda_control_val * hr_sens
    if (!is.null(accrual)) {
      s_treatment_sens <- s_avg(lambda_treatment_sens, follow_up, accrual)
    } else {
      s_treatment_sens <- exp(-lambda_treatment_sens * follow_up)
    }
    prob_event_sens <- 1.0 - s_control^(1.0 / (1.0 + r)) * s_treatment_sens^(r / (1.0 + r))
  } else {
    prob_event_sens <- prob_event
  }

  N_sens <- as.integer(ceiling(d_sens / prob_event_sens))
  total_sens_dropout <- as.integer(ceiling(N_sens / (1 - dropout_rate)))

  # Build event probability section
  event_prob_info <- list(
    method = event_method,
    prob_event_overall = round(prob_event, 6)
  )
  if (event_method == "exponential_model") {
    event_prob_info$median_control <- median_control
    event_prob_info$lambda_control <- round(lambda_control_val, 6)
    event_prob_info$lambda_treatment <- round(lambda_treatment_val, 6)
    event_prob_info$follow_up <- follow_up
    if (!is.null(accrual)) {
      event_prob_info$accrual <- accrual
    }
  }

  # Format allocation ratio string
  if (allocation_ratio != 1.0) {
    alloc_str <- paste0(format(allocation_ratio, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  # Assumptions
  if (!is.null(accrual)) {
    accrual_assumption <- "Uniform accrual over recruitment period"
  } else {
    accrual_assumption <- "No staggered accrual assumed"
  }

  list(
    endpoint_type = "time-to-event",
    study_design = design,
    statistical_test = paste0("Log-rank test (", sidedness, ")"),
    hazard_ratio = hr,
    alpha = alpha,
    power = power,
    allocation_ratio = alloc_str,
    dropout_rate = dropout_rate,
    event_probability = event_prob_info,
    events_required = list(
      total = d,
      treatment_arm = events_treatment,
      control_arm = events_control
    ),
    sample_size = list(
      treatment_arm = n_treatment,
      control_arm = n_control,
      total = N,
      total_with_dropout = total_with_dropout,
      treatment_with_dropout = treatment_with_dropout,
      control_with_dropout = control_with_dropout
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        events_required = d_90,
        total_patients = N_90,
        total_with_dropout = total_90_dropout
      ),
      hr_less_favorable_10_percent = list(
        hazard_ratio = round(hr_sens, 4),
        events_required = d_sens,
        total_patients = N_sens,
        total_with_dropout = total_sens_dropout
      )
    ),
    assumptions = c(
      "Proportional hazards assumption holds",
      "Log-rank test for primary analysis",
      paste0("Hazard ratio of ", hr, " is clinically meaningful and realistic"),
      paste0("Event probability of ", round(prob_event, 4), " based on ", gsub("_", " ", event_method)),
      "Censoring is non-informative",
      accrual_assumption
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate assumptions",
      "Exponential survival model may not hold; consider Weibull or piecewise models if appropriate"
    )
  )
}


# --- Argument parsing ---

parse_args <- function(args) {
  defaults <- list(
    hr = NULL,
    event_prob = NULL,
    median_control = NULL,
    follow_up = NULL,
    accrual = NULL,
    alpha = 0.05,
    power = 0.80,
    dropout = 0.15,
    allocation = 1.0,
    design = "superiority",
    output = NULL
  )

  i <- 1
  while (i <= length(args)) {
    key <- args[i]
    if (i + 1 > length(args)) stop(paste("Missing value for argument:", key))
    val <- args[i + 1]

    switch(key,
      "--hr" = { defaults$hr <- as.numeric(val) },
      "--event-prob" = { defaults$event_prob <- as.numeric(val) },
      "--median-control" = { defaults$median_control <- as.numeric(val) },
      "--follow-up" = { defaults$follow_up <- as.numeric(val) },
      "--accrual" = { defaults$accrual <- as.numeric(val) },
      "--alpha" = { defaults$alpha <- as.numeric(val) },
      "--power" = { defaults$power <- as.numeric(val) },
      "--dropout" = { defaults$dropout <- as.numeric(val) },
      "--allocation" = { defaults$allocation <- as.numeric(val) },
      "--design" = { defaults$design <- val },
      "--output" = { defaults$output <- val },
      stop(paste("Unknown argument:", key))
    )
    i <- i + 2
  }

  if (is.null(defaults$hr)) stop("--hr is required")

  # Validate event probability input
  has_event_prob <- !is.null(defaults$event_prob)
  has_exponential <- !is.null(defaults$median_control) || !is.null(defaults$follow_up)

  if (has_event_prob && has_exponential) {
    stop("Provide either --event-prob OR (--median-control and --follow-up), not both")
  }
  if (!has_event_prob && !has_exponential) {
    stop("Must provide either --event-prob OR (--median-control and --follow-up)")
  }
  if (has_exponential) {
    if (is.null(defaults$median_control) || is.null(defaults$follow_up)) {
      stop("Both --median-control and --follow-up are required for the exponential model")
    }
  }

  if (!(defaults$design %in% c("superiority", "non-inferiority"))) {
    stop("--design must be 'superiority' or 'non-inferiority'")
  }

  defaults
}


main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  result <- calculate_survival_sample_size(
    hr = args$hr,
    event_prob = args$event_prob,
    median_control = args$median_control,
    follow_up = args$follow_up,
    accrual = args$accrual,
    alpha = args$alpha,
    power = args$power,
    allocation_ratio = args$allocation,
    dropout_rate = args$dropout,
    design = args$design
  )

  # Check for errors
  if (!is.null(result$error)) {
    message(paste("ERROR:", result$error))
    quit(status = 1)
  }

  # Convert to JSON with 2-space indent to match Python output
  json_str <- jsonlite::toJSON(result, auto_unbox = TRUE, pretty = FALSE, digits = NA)
  json_str <- jsonlite::prettify(json_str, indent = 2)

  if (!is.null(args$output)) {
    writeLines(json_str, args$output)
    cat(paste0("Results written to ", args$output, "\n"))
  } else {
    cat(json_str)
    cat("\n")
  }
}

main()
