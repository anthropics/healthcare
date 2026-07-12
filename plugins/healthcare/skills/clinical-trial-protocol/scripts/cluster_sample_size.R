#!/usr/bin/env Rscript
#
# Cluster Randomized Trial Sample Size Calculator (R version)
#
# Sample size calculations for cluster randomized clinical trials,
# accounting for intra-cluster correlation (ICC) via the design effect.
# Supports continuous and binary primary endpoints.
# Drop-in alternative to cluster_sample_size.py — identical CLI and JSON output.
#

# Check for jsonlite
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

calculate_cluster_continuous <- function(
    effect_size,
    std_dev,
    cluster_size,
    icc,
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

  # Individual-level sample size per arm
  if (allocation_ratio == 1.0) {
    n_per_arm <- 2 * ((z_alpha + z_beta)^2) / (cohens_d^2)
  } else {
    n_per_arm <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta)^2) / (cohens_d^2)
  }

  n_per_arm <- as.integer(ceiling(n_per_arm))

  if (allocation_ratio == 1.0) {
    n_control <- n_per_arm
    n_treatment <- n_per_arm
  } else {
    n_treatment <- n_per_arm
    n_control <- as.integer(ceiling(n_per_arm / allocation_ratio))
  }

  total_individual <- as.integer(n_treatment + n_control)

  # Design effect
  deff <- 1 + (cluster_size - 1) * icc

  # Cluster-adjusted sample sizes
  n_treatment_adj <- as.integer(ceiling(n_treatment * deff))
  n_control_adj <- as.integer(ceiling(n_control * deff))
  clusters_treatment <- as.integer(ceiling(n_treatment_adj / cluster_size))
  clusters_control <- as.integer(ceiling(n_control_adj / cluster_size))
  total_clusters <- as.integer(clusters_treatment + clusters_control)
  total_subjects <- as.integer(total_clusters * cluster_size)
  total_subjects_with_dropout <- as.integer(ceiling(total_subjects / (1 - dropout_rate)))

  # --- Sensitivity analysis: power at 90% ---
  z_beta_90 <- qnorm(0.90)
  if (allocation_ratio == 1.0) {
    n_per_arm_90 <- 2 * ((z_alpha + z_beta_90)^2) / (cohens_d^2)
  } else {
    n_per_arm_90 <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta_90)^2) / (cohens_d^2)
  }
  n_per_arm_90 <- as.integer(ceiling(n_per_arm_90))

  if (allocation_ratio == 1.0) {
    n_treatment_90 <- n_per_arm_90
    n_control_90 <- n_per_arm_90
  } else {
    n_treatment_90 <- n_per_arm_90
    n_control_90 <- as.integer(ceiling(n_per_arm_90 / allocation_ratio))
  }

  n_treatment_adj_90 <- as.integer(ceiling(n_treatment_90 * deff))
  n_control_adj_90 <- as.integer(ceiling(n_control_90 * deff))
  clusters_treatment_90 <- as.integer(ceiling(n_treatment_adj_90 / cluster_size))
  clusters_control_90 <- as.integer(ceiling(n_control_adj_90 / cluster_size))
  total_clusters_90 <- as.integer(clusters_treatment_90 + clusters_control_90)
  total_subjects_90 <- as.integer(total_clusters_90 * cluster_size)
  total_subjects_90_dropout <- as.integer(ceiling(total_subjects_90 / (1 - dropout_rate)))

  # --- Sensitivity analysis: ICC increased by 50% ---
  icc_high <- icc * 1.5
  deff_high <- 1 + (cluster_size - 1) * icc_high

  n_treatment_adj_icc <- as.integer(ceiling(n_treatment * deff_high))
  n_control_adj_icc <- as.integer(ceiling(n_control * deff_high))
  clusters_treatment_icc <- as.integer(ceiling(n_treatment_adj_icc / cluster_size))
  clusters_control_icc <- as.integer(ceiling(n_control_adj_icc / cluster_size))
  total_clusters_icc <- as.integer(clusters_treatment_icc + clusters_control_icc)
  total_subjects_icc <- as.integer(total_clusters_icc * cluster_size)
  total_subjects_icc_dropout <- as.integer(ceiling(total_subjects_icc / (1 - dropout_rate)))

  # Format allocation ratio string
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
    cluster_info = list(
      cluster_size = as.integer(cluster_size),
      icc = icc,
      design_effect = round(deff, 4)
    ),
    sample_size = list(
      individual_level = list(
        treatment_arm = n_treatment,
        control_arm = n_control,
        total = total_individual
      ),
      cluster_adjusted = list(
        treatment_arm = n_treatment_adj,
        control_arm = n_control_adj,
        clusters_treatment = clusters_treatment,
        clusters_control = clusters_control,
        total_clusters = total_clusters,
        total_subjects = total_subjects,
        total_subjects_with_dropout = total_subjects_with_dropout
      )
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        total_clusters = total_clusters_90,
        total_subjects = total_subjects_90,
        total_subjects_with_dropout = total_subjects_90_dropout
      ),
      icc_increased_50_percent = list(
        icc_high = round(icc_high, 4),
        design_effect_high = round(deff_high, 4),
        total_clusters = total_clusters_icc,
        total_subjects = total_subjects_icc,
        total_subjects_with_dropout = total_subjects_icc_dropout
      )
    ),
    assumptions = c(
      "Normally distributed continuous outcome",
      "Equal variances between groups",
      "Observations within clusters are correlated (ICC > 0)",
      "Observations between clusters are independent",
      paste0("Cluster size of ", cluster_size, " is approximately equal across clusters"),
      paste0("ICC of ", icc, " is based on prior data or literature"),
      paste0("Effect size of ", effect_size, " is clinically meaningful and realistic")
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate ICC and cluster size assumptions",
      "Variable cluster sizes may require additional adjustment"
    )
  )
}


calculate_cluster_binary <- function(
    p1,
    p2,
    cluster_size,
    icc,
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

  # Individual-level sample size for two proportions
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

  total_individual <- as.integer(n_treatment + n_control)

  # Design effect
  deff <- 1 + (cluster_size - 1) * icc

  # Cluster-adjusted sample sizes
  n_treatment_adj <- as.integer(ceiling(n_treatment * deff))
  n_control_adj <- as.integer(ceiling(n_control * deff))
  clusters_treatment <- as.integer(ceiling(n_treatment_adj / cluster_size))
  clusters_control <- as.integer(ceiling(n_control_adj / cluster_size))
  total_clusters <- as.integer(clusters_treatment + clusters_control)
  total_subjects <- as.integer(total_clusters * cluster_size)
  total_subjects_with_dropout <- as.integer(ceiling(total_subjects / (1 - dropout_rate)))

  # --- Sensitivity analysis: power at 90% ---
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
    n_control_90 <- n_treatment_90
  } else {
    n_control_90 <- as.integer(ceiling(n_treatment_90 / allocation_ratio))
  }

  n_treatment_adj_90 <- as.integer(ceiling(n_treatment_90 * deff))
  n_control_adj_90 <- as.integer(ceiling(n_control_90 * deff))
  clusters_treatment_90 <- as.integer(ceiling(n_treatment_adj_90 / cluster_size))
  clusters_control_90 <- as.integer(ceiling(n_control_adj_90 / cluster_size))
  total_clusters_90 <- as.integer(clusters_treatment_90 + clusters_control_90)
  total_subjects_90 <- as.integer(total_clusters_90 * cluster_size)
  total_subjects_90_dropout <- as.integer(ceiling(total_subjects_90 / (1 - dropout_rate)))

  # --- Sensitivity analysis: ICC increased by 50% ---
  icc_high <- icc * 1.5
  deff_high <- 1 + (cluster_size - 1) * icc_high

  n_treatment_adj_icc <- as.integer(ceiling(n_treatment * deff_high))
  n_control_adj_icc <- as.integer(ceiling(n_control * deff_high))
  clusters_treatment_icc <- as.integer(ceiling(n_treatment_adj_icc / cluster_size))
  clusters_control_icc <- as.integer(ceiling(n_control_adj_icc / cluster_size))
  total_clusters_icc <- as.integer(clusters_treatment_icc + clusters_control_icc)
  total_subjects_icc <- as.integer(total_clusters_icc * cluster_size)
  total_subjects_icc_dropout <- as.integer(ceiling(total_subjects_icc / (1 - dropout_rate)))

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
    cluster_info = list(
      cluster_size = as.integer(cluster_size),
      icc = icc,
      design_effect = round(deff, 4)
    ),
    sample_size = list(
      individual_level = list(
        treatment_arm = n_treatment,
        control_arm = n_control,
        total = total_individual
      ),
      cluster_adjusted = list(
        treatment_arm = n_treatment_adj,
        control_arm = n_control_adj,
        clusters_treatment = clusters_treatment,
        clusters_control = clusters_control,
        total_clusters = total_clusters,
        total_subjects = total_subjects,
        total_subjects_with_dropout = total_subjects_with_dropout
      )
    ),
    sensitivity_analysis = list(
      power_90_percent = list(
        total_clusters = total_clusters_90,
        total_subjects = total_subjects_90,
        total_subjects_with_dropout = total_subjects_90_dropout
      ),
      icc_increased_50_percent = list(
        icc_high = round(icc_high, 4),
        design_effect_high = round(deff_high, 4),
        total_clusters = total_clusters_icc,
        total_subjects = total_subjects_icc,
        total_subjects_with_dropout = total_subjects_icc_dropout
      )
    ),
    assumptions = c(
      "Binary outcome (success/failure, event/no event)",
      "Large enough sample for normal approximation",
      "Observations within clusters are correlated (ICC > 0)",
      "Observations between clusters are independent",
      paste0("Cluster size of ", cluster_size, " is approximately equal across clusters"),
      paste0("ICC of ", icc, " is based on prior data or literature"),
      paste0("Effect size of ", round(effect_size * 100, 1), "% is clinically meaningful and realistic")
    ),
    disclaimers = c(
      "Sample size calculation is preliminary and based on assumptions",
      "Final sample size requires biostatistician review and validation",
      "FDA Pre-Submission meeting may require adjustments",
      "Consider pilot study to validate ICC and cluster size assumptions",
      "Variable cluster sizes may require additional adjustment"
    )
  )
}


# --- Argument parsing ---

parse_args <- function(args) {
  defaults <- list(
    type = NULL,
    cluster_size = NULL,
    icc = NULL,
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
      "--cluster-size" = { defaults$cluster_size <- as.integer(val) },
      "--icc" = { defaults$icc <- as.numeric(val) },
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
  if (is.null(defaults$cluster_size)) {
    stop("--cluster-size is required")
  }
  if (is.null(defaults$icc)) {
    stop("--icc is required")
  }

  defaults
}


main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  if (args$type == "continuous") {
    if (is.null(args$effect_size) || is.null(args$std_dev)) {
      stop("--effect-size and --std-dev required for continuous endpoints")
    }
    result <- calculate_cluster_continuous(
      effect_size = args$effect_size,
      std_dev = args$std_dev,
      cluster_size = args$cluster_size,
      icc = args$icc,
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
    result <- calculate_cluster_binary(
      p1 = args$p1,
      p2 = args$p2,
      cluster_size = args$cluster_size,
      icc = args$icc,
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
