#!/usr/bin/env Rscript
#
# TOST Equivalence Sample Size Calculator for Clinical Trial Design
#
# Calculates sample size for equivalence trials using the Two One-Sided Tests
# (TOST) procedure. Supports continuous and binary endpoints.
#

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

calculate_continuous_equivalence <- function(
    margin,
    std_dev,
    expected_diff = 0.0,
    alpha = 0.05,
    power = 0.80,
    allocation_ratio = 1.0,
    dropout_rate = 0.15
) {
  if (margin <= abs(expected_diff)) {
    return(list(error = "Equivalence margin must be strictly greater than the absolute expected difference"))
  }
  if (margin <= 0) {
    return(list(error = "Equivalence margin must be positive"))
  }

  z_alpha <- qnorm(1 - alpha)
  z_beta <- qnorm(power)

  denom <- (margin - abs(expected_diff))^2

  if (allocation_ratio == 1.0) {
    n_per_arm <- as.integer(ceiling((z_alpha + z_beta)^2 * 2 * std_dev^2 / denom))
    n_treatment <- n_per_arm
    n_control <- n_per_arm
  } else {
    r <- allocation_ratio
    n_treatment <- as.integer(ceiling((z_alpha + z_beta)^2 * std_dev^2 * (1 + 1 / r) / denom))
    n_control <- as.integer(ceiling(n_treatment / r))
  }

  total <- as.integer(n_treatment + n_control)
  total_dropout <- as.integer(ceiling(total / (1 - dropout_rate)))
  n_treatment_dropout <- as.integer(ceiling(n_treatment / (1 - dropout_rate)))
  n_control_dropout <- as.integer(ceiling(n_control / (1 - dropout_rate)))

  # Sensitivity: 90% power
  z_beta_90 <- qnorm(0.90)
  if (allocation_ratio == 1.0) {
    n_90 <- as.integer(ceiling((z_alpha + z_beta_90)^2 * 2 * std_dev^2 / denom))
    total_90 <- as.integer(n_90 * 2L)
  } else {
    n_90 <- as.integer(ceiling((z_alpha + z_beta_90)^2 * std_dev^2 * (1 + 1 / r) / denom))
    total_90 <- as.integer(n_90 + as.integer(ceiling(n_90 / r)))
  }
  total_90_dropout <- as.integer(ceiling(total_90 / (1 - dropout_rate)))

  # Sensitivity: margin tightened by 10%
  margin_tight <- margin * 0.9
  if (margin_tight > abs(expected_diff)) {
    denom_tight <- (margin_tight - abs(expected_diff))^2
    if (allocation_ratio == 1.0) {
      n_tight <- as.integer(ceiling((z_alpha + z_beta)^2 * 2 * std_dev^2 / denom_tight))
      total_tight <- as.integer(n_tight * 2L)
    } else {
      n_tight <- as.integer(ceiling((z_alpha + z_beta)^2 * std_dev^2 * (1 + 1 / r) / denom_tight))
      total_tight <- as.integer(n_tight + as.integer(ceiling(n_tight / r)))
    }
    sens_tight <- list(
      total = total_tight,
      total_with_dropout = as.integer(ceiling(total_tight / (1 - dropout_rate)))
    )
  } else {
    sens_tight <- NULL
  }

  # Format allocation ratio
  if (allocation_ratio != 1.0) {
    alloc_str <- paste0(format(allocation_ratio, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  list(
    endpoint_type = "continuous",
    study_design = "equivalence",
    statistical_test = "TOST (Two One-Sided Tests)",
    equivalence_margin = margin,
    expected_difference = expected_diff,
    standard_deviation = std_dev,
    alpha = alpha,
    power = power,
    allocation_ratio = alloc_str,
    dropout_rate = dropout_rate,
    sample_size = list(
      treatment_arm = n_treatment,
      control_arm = n_control,
      total = total,
      total_with_dropout = total_dropout,
      treatment_with_dropout = n_treatment_dropout,
      control_with_dropout = n_control_dropout
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        total = total_90,
        total_with_dropout = total_90_dropout
      ),
      margin_tightened_10_percent = sens_tight
    ),
    assumptions = c(
      "Normally distributed continuous outcome",
      "Equal variances between groups",
      "Independent observations",
      paste0("True difference of ", expected_diff, " falls within equivalence margin of [-", margin, ", ", margin, "]"),
      paste0("TOST procedure with one-sided alpha = ", alpha, " (equivalent to ", round((1 - 2 * alpha) * 100), "% CI)")
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate assumptions",
      "For bioequivalence studies, ensure margins meet regulatory requirements (e.g., 80-125% for pharmacokinetic endpoints)"
    )
  )
}


calculate_binary_equivalence <- function(
    margin,
    p1,
    p2,
    alpha = 0.05,
    power = 0.80,
    allocation_ratio = 1.0,
    dropout_rate = 0.15
) {
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1)) {
    return(list(error = "Proportions must be between 0 and 1 (exclusive)"))
  }
  if (margin <= 0) {
    return(list(error = "Equivalence margin must be positive"))
  }

  expected_diff <- abs(p1 - p2)
  if (margin <= expected_diff) {
    return(list(error = "Equivalence margin must be strictly greater than the absolute expected difference"))
  }

  z_alpha <- qnorm(1 - alpha)
  z_beta <- qnorm(power)

  denom <- (margin - expected_diff)^2
  sigma_sq <- p1 * (1 - p1) + p2 * (1 - p2)

  if (allocation_ratio == 1.0) {
    n_per_arm <- as.integer(ceiling((z_alpha + z_beta)^2 * sigma_sq / denom))
    n_treatment <- n_per_arm
    n_control <- n_per_arm
  } else {
    r <- allocation_ratio
    sigma_sq_unequal <- p1 * (1 - p1) / r + p2 * (1 - p2)
    n_treatment <- as.integer(ceiling((z_alpha + z_beta)^2 * sigma_sq_unequal / denom))
    n_control <- as.integer(ceiling(n_treatment / r))
  }

  total <- as.integer(n_treatment + n_control)
  total_dropout <- as.integer(ceiling(total / (1 - dropout_rate)))
  n_treatment_dropout <- as.integer(ceiling(n_treatment / (1 - dropout_rate)))
  n_control_dropout <- as.integer(ceiling(n_control / (1 - dropout_rate)))

  # Sensitivity: 90% power
  z_beta_90 <- qnorm(0.90)
  if (allocation_ratio == 1.0) {
    n_90 <- as.integer(ceiling((z_alpha + z_beta_90)^2 * sigma_sq / denom))
    total_90 <- as.integer(n_90 * 2L)
  } else {
    n_90 <- as.integer(ceiling((z_alpha + z_beta_90)^2 * sigma_sq_unequal / denom))
    total_90 <- as.integer(n_90 + as.integer(ceiling(n_90 / r)))
  }
  total_90_dropout <- as.integer(ceiling(total_90 / (1 - dropout_rate)))

  # Sensitivity: margin tightened by 10%
  margin_tight <- margin * 0.9
  if (margin_tight > expected_diff) {
    denom_tight <- (margin_tight - expected_diff)^2
    if (allocation_ratio == 1.0) {
      n_tight <- as.integer(ceiling((z_alpha + z_beta)^2 * sigma_sq / denom_tight))
      total_tight <- as.integer(n_tight * 2L)
    } else {
      n_tight <- as.integer(ceiling((z_alpha + z_beta)^2 * sigma_sq_unequal / denom_tight))
      total_tight <- as.integer(n_tight + as.integer(ceiling(n_tight / r)))
    }
    sens_tight <- list(
      total = total_tight,
      total_with_dropout = as.integer(ceiling(total_tight / (1 - dropout_rate)))
    )
  } else {
    sens_tight <- NULL
  }

  if (allocation_ratio != 1.0) {
    alloc_str <- paste0(format(allocation_ratio, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  list(
    endpoint_type = "binary",
    study_design = "equivalence",
    statistical_test = "TOST (Two One-Sided Tests)",
    equivalence_margin = margin,
    proportion_1 = p1,
    proportion_2 = p2,
    expected_difference = round(expected_diff, 4),
    alpha = alpha,
    power = power,
    allocation_ratio = alloc_str,
    dropout_rate = dropout_rate,
    sample_size = list(
      treatment_arm = n_treatment,
      control_arm = n_control,
      total = total,
      total_with_dropout = total_dropout,
      treatment_with_dropout = n_treatment_dropout,
      control_with_dropout = n_control_dropout
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        total = total_90,
        total_with_dropout = total_90_dropout
      ),
      margin_tightened_10_percent = sens_tight
    ),
    assumptions = c(
      "Binary outcome (success/failure, event/no event)",
      "Independent observations",
      "Large enough sample for normal approximation",
      paste0("True difference of ", round(expected_diff * 100, 1), "% falls within equivalence margin of [-", round(margin * 100, 1), "%, ", round(margin * 100, 1), "%]"),
      paste0("TOST procedure with one-sided alpha = ", alpha, " (equivalent to ", round((1 - 2 * alpha) * 100), "% CI)")
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate assumptions",
      "For bioequivalence studies, ensure margins meet regulatory requirements (e.g., 80-125% for pharmacokinetic endpoints)"
    )
  )
}


# --- Argument parsing ---

parse_args <- function(args) {
  defaults <- list(
    type = NULL, margin = NULL, expected_diff = 0.0,
    std_dev = NULL, p1 = NULL, p2 = NULL,
    alpha = 0.05, power = 0.80, dropout = 0.15, allocation = 1.0,
    output = NULL
  )

  i <- 1
  while (i <= length(args)) {
    key <- args[i]
    if (i + 1 > length(args)) stop(paste("Missing value for argument:", key))
    val <- args[i + 1]

    switch(key,
      "--type" = { defaults$type <- val },
      "--margin" = { defaults$margin <- as.numeric(val) },
      "--expected-diff" = { defaults$expected_diff <- as.numeric(val) },
      "--std-dev" = { defaults$std_dev <- as.numeric(val) },
      "--p1" = { defaults$p1 <- as.numeric(val) },
      "--p2" = { defaults$p2 <- as.numeric(val) },
      "--alpha" = { defaults$alpha <- as.numeric(val) },
      "--power" = { defaults$power <- as.numeric(val) },
      "--dropout" = { defaults$dropout <- as.numeric(val) },
      "--allocation" = { defaults$allocation <- as.numeric(val) },
      "--output" = { defaults$output <- val },
      stop(paste("Unknown argument:", key))
    )
    i <- i + 2
  }

  if (is.null(defaults$type)) stop("--type is required (continuous or binary)")
  if (is.null(defaults$margin)) stop("--margin is required")
  defaults
}


main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  if (args$type == "continuous") {
    if (is.null(args$std_dev)) stop("--std-dev required for continuous endpoints")
    result <- calculate_continuous_equivalence(
      margin = args$margin,
      std_dev = args$std_dev,
      expected_diff = args$expected_diff,
      alpha = args$alpha,
      power = args$power,
      allocation_ratio = args$allocation,
      dropout_rate = args$dropout
    )
  } else if (args$type == "binary") {
    if (is.null(args$p1) || is.null(args$p2)) stop("--p1 and --p2 required for binary endpoints")
    result <- calculate_binary_equivalence(
      margin = args$margin,
      p1 = args$p1,
      p2 = args$p2,
      alpha = args$alpha,
      power = args$power,
      allocation_ratio = args$allocation,
      dropout_rate = args$dropout
    )
  } else {
    stop("--type must be 'continuous' or 'binary'")
  }

  if (!is.null(result$error)) {
    message(paste("ERROR:", result$error))
    quit(status = 1)
  }

  json_str <- jsonlite::toJSON(result, auto_unbox = TRUE, pretty = FALSE, digits = NA, null = "null")
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
