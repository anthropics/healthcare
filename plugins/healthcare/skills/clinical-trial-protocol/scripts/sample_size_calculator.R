#!/usr/bin/env Rscript
#
# FDA Device Clinical Trial Sample Size Calculator (R version)
#
# Simple, accurate statistical power calculations for medical device trials.
# Supports continuous and binary primary endpoints.
# Drop-in alternative to sample_size_calculator.py — identical CLI and JSON output.
#

# Check for jsonlite
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

calculate_continuous_sample_size <- function(
    effect_size,
    std_dev,
    alpha = 0.05,
    power = 0.80,
    allocation_ratio = 1.0,
    dropout_rate = 0.15,
    design = "superiority"
) {
  # Calculate effect size (Cohen's d)
  cohens_d <- abs(effect_size) / std_dev

  # Determine sidedness
  if (design == "superiority") {
    alpha_adj <- alpha / 2  # Two-sided test
    sidedness <- "two-sided"
  } else {  # non-inferiority
    alpha_adj <- alpha  # One-sided test
    sidedness <- "one-sided"
  }

  # Z-scores for alpha and beta
  z_alpha <- qnorm(1 - alpha_adj)
  z_beta <- qnorm(power)

  # Sample size per arm
  if (allocation_ratio == 1.0) {
    n_per_arm <- 2 * ((z_alpha + z_beta)^2) / (cohens_d^2)
  } else {
    n_per_arm <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta)^2) / (cohens_d^2)
  }

  n_per_arm <- as.integer(ceiling(n_per_arm))

  # Calculate control arm size if unequal allocation
  if (allocation_ratio == 1.0) {
    n_control <- n_per_arm
    n_treatment <- n_per_arm
  } else {
    n_treatment <- n_per_arm
    n_control <- as.integer(ceiling(n_per_arm / allocation_ratio))
  }

  total_n <- as.integer(n_treatment + n_control)

  # Adjust for dropout
  total_with_dropout <- as.integer(ceiling(total_n / (1 - dropout_rate)))
  n_treatment_with_dropout <- as.integer(ceiling(n_treatment / (1 - dropout_rate)))
  n_control_with_dropout <- as.integer(ceiling(n_control / (1 - dropout_rate)))

  # Sensitivity analysis: 90% power
  z_beta_90 <- qnorm(0.90)
  if (allocation_ratio == 1.0) {
    n_per_arm_90 <- 2 * ((z_alpha + z_beta_90)^2) / (cohens_d^2)
  } else {
    n_per_arm_90 <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta_90)^2) / (cohens_d^2)
  }
  n_per_arm_90 <- as.integer(ceiling(n_per_arm_90))

  if (allocation_ratio == 1.0) {
    total_90 <- as.integer(n_per_arm_90 * 2L)
  } else {
    total_90 <- as.integer(n_per_arm_90 + as.integer(ceiling(n_per_arm_90 / allocation_ratio)))
  }
  total_90_dropout <- as.integer(ceiling(total_90 / (1 - dropout_rate)))

  # Sensitivity analysis: Effect size reduced by 10%
  cohens_d_reduced <- cohens_d * 0.9
  if (allocation_ratio == 1.0) {
    n_per_arm_reduced <- 2 * ((z_alpha + z_beta)^2) / (cohens_d_reduced^2)
  } else {
    n_per_arm_reduced <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta)^2) / (cohens_d_reduced^2)
  }
  n_per_arm_reduced <- as.integer(ceiling(n_per_arm_reduced))

  if (allocation_ratio == 1.0) {
    total_reduced <- as.integer(n_per_arm_reduced * 2L)
  } else {
    total_reduced <- as.integer(n_per_arm_reduced + as.integer(ceiling(n_per_arm_reduced / allocation_ratio)))
  }
  total_reduced_dropout <- as.integer(ceiling(total_reduced / (1 - dropout_rate)))

  # Format allocation ratio string to match Python output
  if (allocation_ratio != 1.0) {
    alloc_str <- paste0(format(allocation_ratio, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  list(
    endpoint_type = "continuous",
    study_design = design,
    statistical_test = paste0("Two-sample t-test (", sidedness, ")"),
    effect_size = effect_size,
    standard_deviation = std_dev,
    cohens_d = round(cohens_d, 3),
    alpha = alpha,
    power = power,
    allocation_ratio = alloc_str,
    dropout_rate = dropout_rate,
    sample_size = list(
      treatment_arm = n_treatment,
      control_arm = n_control,
      total = total_n,
      total_with_dropout = total_with_dropout,
      treatment_with_dropout = n_treatment_with_dropout,
      control_with_dropout = n_control_with_dropout
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        total = total_90,
        total_with_dropout = total_90_dropout
      ),
      effect_size_reduced_10_percent = list(
        total = total_reduced,
        total_with_dropout = total_reduced_dropout
      )
    ),
    assumptions = c(
      "Normally distributed continuous outcome",
      "Equal variances between groups",
      "Independent observations",
      paste0("Effect size of ", effect_size, " is clinically meaningful and realistic")
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate assumptions"
    )
  )
}


calculate_binary_sample_size <- function(
    p1,
    p2,
    alpha = 0.05,
    power = 0.80,
    allocation_ratio = 1.0,
    dropout_rate = 0.15,
    design = "superiority"
) {
  # Validate proportions
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1)) {
    return(list(error = "Proportions must be between 0 and 1 (exclusive)"))
  }

  # Determine sidedness
  if (design == "superiority") {
    alpha_adj <- alpha / 2
    sidedness <- "two-sided"
  } else {
    alpha_adj <- alpha
    sidedness <- "one-sided"
  }

  # Calculate pooled proportion
  if (allocation_ratio == 1.0) {
    p_pooled <- (p1 + p2) / 2
  } else {
    p_pooled <- (p1 + allocation_ratio * p2) / (1 + allocation_ratio)
  }

  # Z-scores
  z_alpha <- qnorm(1 - alpha_adj)
  z_beta <- qnorm(power)

  # Effect size
  effect_size <- abs(p2 - p1)

  # Sample size calculation for two proportions
  if (allocation_ratio == 1.0) {
    numerator <- (z_alpha * sqrt(2 * p_pooled * (1 - p_pooled)) +
                  z_beta * sqrt(p1 * (1 - p1) + p2 * (1 - p2)))^2
  } else {
    numerator <- (z_alpha * sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / allocation_ratio)) +
                  z_beta * sqrt(p1 * (1 - p1) / allocation_ratio + p2 * (1 - p2)))^2
  }

  n_treatment <- as.integer(ceiling(numerator / (effect_size^2)))

  if (allocation_ratio == 1.0) {
    n_control <- n_treatment
  } else {
    n_control <- as.integer(ceiling(n_treatment / allocation_ratio))
  }

  total_n <- as.integer(n_treatment + n_control)

  # Adjust for dropout
  total_with_dropout <- as.integer(ceiling(total_n / (1 - dropout_rate)))
  n_treatment_with_dropout <- as.integer(ceiling(n_treatment / (1 - dropout_rate)))
  n_control_with_dropout <- as.integer(ceiling(n_control / (1 - dropout_rate)))

  # Sensitivity analysis: 90% power
  z_beta_90 <- qnorm(0.90)
  if (allocation_ratio == 1.0) {
    numerator_90 <- (z_alpha * sqrt(2 * p_pooled * (1 - p_pooled)) +
                     z_beta_90 * sqrt(p1 * (1 - p1) + p2 * (1 - p2)))^2
  } else {
    numerator_90 <- (z_alpha * sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / allocation_ratio)) +
                     z_beta_90 * sqrt(p1 * (1 - p1) / allocation_ratio + p2 * (1 - p2)))^2
  }

  n_treatment_90 <- as.integer(ceiling(numerator_90 / (effect_size^2)))
  if (allocation_ratio == 1.0) {
    total_90 <- as.integer(n_treatment_90 * 2L)
  } else {
    total_90 <- as.integer(n_treatment_90 + as.integer(ceiling(n_treatment_90 / allocation_ratio)))
  }
  total_90_dropout <- as.integer(ceiling(total_90 / (1 - dropout_rate)))

  # Sensitivity analysis: Effect size reduced by 10%
  effect_reduced <- effect_size * 0.9
  if (p2 > p1) {
    p2_reduced <- p1 + effect_reduced
  } else {
    p2_reduced <- p1 - effect_reduced
  }

  # Use original p_pooled (not recomputed) to match Python behavior
  if (allocation_ratio == 1.0) {
    numerator_reduced <- (z_alpha * sqrt(2 * p_pooled * (1 - p_pooled)) +
                          z_beta * sqrt(p1 * (1 - p1) + p2_reduced * (1 - p2_reduced)))^2
  } else {
    numerator_reduced <- (z_alpha * sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / allocation_ratio)) +
                          z_beta * sqrt(p1 * (1 - p1) / allocation_ratio + p2_reduced * (1 - p2_reduced)))^2
  }

  n_treatment_reduced <- as.integer(ceiling(numerator_reduced / (effect_reduced^2)))
  if (allocation_ratio == 1.0) {
    total_reduced <- as.integer(n_treatment_reduced * 2L)
  } else {
    total_reduced <- as.integer(n_treatment_reduced + as.integer(ceiling(n_treatment_reduced / allocation_ratio)))
  }
  total_reduced_dropout <- as.integer(ceiling(total_reduced / (1 - dropout_rate)))

  # Format allocation ratio string
  if (allocation_ratio != 1.0) {
    alloc_str <- paste0(format(allocation_ratio, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  list(
    endpoint_type = "binary",
    study_design = design,
    statistical_test = paste0("Two-proportion z-test (", sidedness, ")"),
    control_proportion = p1,
    treatment_proportion = p2,
    effect_size = round(effect_size, 4),
    alpha = alpha,
    power = power,
    allocation_ratio = alloc_str,
    dropout_rate = dropout_rate,
    sample_size = list(
      treatment_arm = n_treatment,
      control_arm = n_control,
      total = total_n,
      total_with_dropout = total_with_dropout,
      treatment_with_dropout = n_treatment_with_dropout,
      control_with_dropout = n_control_with_dropout
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        total = total_90,
        total_with_dropout = total_90_dropout
      ),
      effect_size_reduced_10_percent = list(
        total = total_reduced,
        total_with_dropout = total_reduced_dropout
      )
    ),
    assumptions = c(
      "Binary outcome (success/failure, event/no event)",
      "Independent observations",
      "Large enough sample for normal approximation",
      paste0("Effect size of ", round(effect_size * 100, 1), "% is clinically meaningful and realistic")
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate assumptions"
    )
  )
}


# --- Argument parsing ---

parse_args <- function(args) {
  defaults <- list(
    type = NULL,
    effect_size = NULL,
    std_dev = NULL,
    p1 = NULL,
    p2 = NULL,
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
    if (i + 1 <= length(args)) {
      val <- args[i + 1]
    } else {
      stop(paste("Missing value for argument:", key))
    }

    switch(key,
      "--type" = { defaults$type <- val },
      "--effect-size" = { defaults$effect_size <- as.numeric(val) },
      "--std-dev" = { defaults$std_dev <- as.numeric(val) },
      "--p1" = { defaults$p1 <- as.numeric(val) },
      "--p2" = { defaults$p2 <- as.numeric(val) },
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

  if (is.null(defaults$type)) {
    stop("--type is required (continuous or binary)")
  }
  if (!(defaults$type %in% c("continuous", "binary"))) {
    stop("--type must be 'continuous' or 'binary'")
  }

  defaults
}


main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  if (args$type == "continuous") {
    if (is.null(args$effect_size) || is.null(args$std_dev)) {
      stop("--effect-size and --std-dev required for continuous endpoints")
    }
    result <- calculate_continuous_sample_size(
      effect_size = args$effect_size,
      std_dev = args$std_dev,
      alpha = args$alpha,
      power = args$power,
      allocation_ratio = args$allocation,
      dropout_rate = args$dropout,
      design = args$design
    )
  } else {
    if (is.null(args$p1) || is.null(args$p2)) {
      stop("--p1 and --p2 required for binary endpoints")
    }
    result <- calculate_binary_sample_size(
      p1 = args$p1,
      p2 = args$p2,
      alpha = args$alpha,
      power = args$power,
      allocation_ratio = args$allocation,
      dropout_rate = args$dropout,
      design = args$design
    )
  }

  # Check for errors
  if (!is.null(result$error)) {
    message(paste("ERROR:", result$error))
    quit(status = 1)
  }

  # Convert to JSON with 2-space indent to match Python output
  json_str <- jsonlite::toJSON(result, auto_unbox = TRUE, pretty = FALSE)
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
