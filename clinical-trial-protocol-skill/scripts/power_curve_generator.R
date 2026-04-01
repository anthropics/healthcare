#!/usr/bin/env Rscript
#
# Power Curve Generator for Clinical Trial Design
#
# Generates power curves by sweeping one parameter (effect size or sample size)
# across a range while holding others fixed. Outputs JSON with an array of
# data points for plotting.
#

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

alpha_adj <- function(alpha, design) {
  if (design == "superiority") alpha / 2 else alpha
}

compute_sample_size_continuous <- function(effect_size, std_dev, alpha, power,
                                           allocation_ratio, dropout_rate, design) {
  cohens_d <- abs(effect_size) / std_dev
  z_alpha <- qnorm(1 - alpha_adj(alpha, design))
  z_beta <- qnorm(power)

  if (allocation_ratio == 1.0) {
    n_per_arm <- 2 * ((z_alpha + z_beta)^2) / (cohens_d^2)
  } else {
    n_per_arm <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta)^2) / (cohens_d^2)
  }
  n_per_arm <- as.integer(ceiling(n_per_arm))

  if (allocation_ratio == 1.0) {
    n_treatment <- n_per_arm
    n_control <- n_per_arm
  } else {
    n_treatment <- n_per_arm
    n_control <- as.integer(ceiling(n_per_arm / allocation_ratio))
  }

  total <- as.integer(n_treatment + n_control)
  total_dropout <- as.integer(ceiling(total / (1 - dropout_rate)))
  list(total = total, total_dropout = total_dropout)
}

compute_power_continuous <- function(n_total, effect_size, std_dev, alpha,
                                     allocation_ratio, design) {
  cohens_d <- abs(effect_size) / std_dev
  z_alpha <- qnorm(1 - alpha_adj(alpha, design))

  if (allocation_ratio == 1.0) {
    n_per_arm <- n_total / 2.0
    z_beta <- sqrt(n_per_arm * cohens_d^2 / 2) - z_alpha
  } else {
    r <- allocation_ratio
    n_treatment <- n_total * r / (1 + r)
    z_beta <- sqrt(n_treatment * cohens_d^2 / ((1 + 1 / r)^2)) - z_alpha
  }

  max(0.0, min(1.0, pnorm(z_beta)))
}

compute_sample_size_binary <- function(p1, p2, alpha, power,
                                       allocation_ratio, dropout_rate, design) {
  z_alpha <- qnorm(1 - alpha_adj(alpha, design))
  z_beta <- qnorm(power)
  effect_size <- abs(p2 - p1)

  if (allocation_ratio == 1.0) {
    p_pooled <- (p1 + p2) / 2
    numerator <- (z_alpha * sqrt(2 * p_pooled * (1 - p_pooled)) +
                  z_beta * sqrt(p1 * (1 - p1) + p2 * (1 - p2)))^2
  } else {
    r <- allocation_ratio
    p_pooled <- (p1 + r * p2) / (1 + r)
    numerator <- (z_alpha * sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / r)) +
                  z_beta * sqrt(p1 * (1 - p1) / r + p2 * (1 - p2)))^2
  }

  n_treatment <- as.integer(ceiling(numerator / (effect_size^2)))

  if (allocation_ratio == 1.0) {
    n_control <- n_treatment
  } else {
    n_control <- as.integer(ceiling(n_treatment / allocation_ratio))
  }

  total <- as.integer(n_treatment + n_control)
  total_dropout <- as.integer(ceiling(total / (1 - dropout_rate)))
  list(total = total, total_dropout = total_dropout)
}

compute_power_binary <- function(n_total, p1, p2, alpha, allocation_ratio, design) {
  z_alpha <- qnorm(1 - alpha_adj(alpha, design))
  effect_size <- abs(p2 - p1)

  if (allocation_ratio == 1.0) {
    p_pooled <- (p1 + p2) / 2
    n_treatment <- n_total / 2.0
    z_beta <- (sqrt(n_treatment) * effect_size -
               z_alpha * sqrt(2 * p_pooled * (1 - p_pooled))) /
              sqrt(p1 * (1 - p1) + p2 * (1 - p2))
  } else {
    r <- allocation_ratio
    p_pooled <- (p1 + r * p2) / (1 + r)
    n_treatment <- n_total * r / (1 + r)
    z_beta <- (sqrt(n_treatment) * effect_size -
               z_alpha * sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / r))) /
              sqrt(p1 * (1 - p1) / r + p2 * (1 - p2))
  }

  max(0.0, min(1.0, pnorm(z_beta)))
}

generate_sweep <- function(min_val, max_val, steps) {
  if (steps == 1) return(min_val)
  step_size <- (max_val - min_val) / (steps - 1)
  round(min_val + (0:(steps - 1)) * step_size, 10)
}

parse_args <- function(args) {
  defaults <- list(
    type = NULL, vary = NULL, min = NULL, max = NULL, steps = 20L,
    effect_size = NULL, std_dev = NULL, p1 = NULL, p2 = NULL,
    alpha = 0.05, power = 0.80, dropout = 0.15, allocation = 1.0,
    design = "superiority", output = NULL
  )

  i <- 1
  while (i <= length(args)) {
    key <- args[i]
    if (i + 1 > length(args)) stop(paste("Missing value for argument:", key))
    val <- args[i + 1]

    switch(key,
      "--type" = { defaults$type <- val },
      "--vary" = { defaults$vary <- val },
      "--min" = { defaults$min <- as.numeric(val) },
      "--max" = { defaults$max <- as.numeric(val) },
      "--steps" = { defaults$steps <- as.integer(val) },
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

  if (is.null(defaults$type)) stop("--type is required")
  if (is.null(defaults$vary)) stop("--vary is required")
  if (is.null(defaults$min) || is.null(defaults$max)) stop("--min and --max are required")
  defaults
}

main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))
  sweep <- generate_sweep(args$min, args$max, args$steps)
  curve <- list()

  for (val in sweep) {
    if (args$vary == "effect-size") {
      if (args$type == "continuous") {
        res <- compute_sample_size_continuous(
          val, args$std_dev, args$alpha, args$power,
          args$allocation, args$dropout, args$design)
        curve[[length(curve) + 1]] <- list(
          param_value = val,
          sample_size = res$total,
          sample_size_with_dropout = res$total_dropout,
          power = args$power
        )
      } else {
        p2 <- args$p1 + val
        if (p2 >= 1.0 || p2 <= 0.0) next
        res <- compute_sample_size_binary(
          args$p1, p2, args$alpha, args$power,
          args$allocation, args$dropout, args$design)
        curve[[length(curve) + 1]] <- list(
          param_value = val,
          sample_size = res$total,
          sample_size_with_dropout = res$total_dropout,
          power = args$power
        )
      }
    } else {  # vary sample-size
      n <- as.integer(round(val))
      if (n < 2L) next
      if (args$type == "continuous") {
        pwr <- compute_power_continuous(
          n, args$effect_size, args$std_dev, args$alpha,
          args$allocation, args$design)
      } else {
        pwr <- compute_power_binary(
          n, args$p1, args$p2, args$alpha,
          args$allocation, args$design)
      }
      total_do <- as.integer(ceiling(n / (1 - args$dropout)))
      curve[[length(curve) + 1]] <- list(
        param_value = n,
        sample_size = n,
        sample_size_with_dropout = total_do,
        power = round(pwr, 6)
      )
    }
  }

  # Build fixed_parameters
  fixed <- list(
    alpha = args$alpha,
    allocation_ratio = args$allocation,
    dropout_rate = args$dropout,
    design = args$design
  )
  if (args$type == "continuous") {
    fixed$std_dev <- args$std_dev
    if (args$vary == "sample-size") fixed$effect_size <- args$effect_size
    fixed$power <- args$power
  } else {
    fixed$p1 <- args$p1
    if (args$vary == "sample-size") fixed$p2 <- args$p2
    fixed$power <- args$power
  }

  result <- list(
    endpoint_type = args$type,
    study_design = args$design,
    varied_parameter = args$vary,
    fixed_parameters = fixed,
    curve = curve
  )

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
