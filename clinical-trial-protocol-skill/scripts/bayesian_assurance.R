#!/usr/bin/env Rscript
#
# Bayesian Assurance (Expected Power) Calculator (R version)
#
# Computes expected power by averaging statistical power over a prior distribution
# on the treatment effect size. Uses Monte Carlo simulation with a normal prior.
# Supports continuous and binary primary endpoints.
# Drop-in alternative to bayesian_assurance.py — identical CLI and JSON output.
#

# Check for jsonlite
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

compute_power_continuous <- function(effect_sizes, std_dev, n_total, alpha,
                                     allocation_ratio, design) {
  cohens_d <- abs(effect_sizes) / std_dev

  if (design == "superiority") {
    alpha_adj <- alpha / 2
  } else {
    alpha_adj <- alpha
  }

  z_alpha <- qnorm(1 - alpha_adj)

  if (allocation_ratio == 1.0) {
    n_per_arm <- n_total / 2.0
    z_beta <- sqrt(n_per_arm * cohens_d^2 / 2) - z_alpha
  } else {
    r <- allocation_ratio
    n_treatment <- n_total * r / (1 + r)
    z_beta <- sqrt(n_treatment * cohens_d^2 / ((1 + 1 / r)^2)) - z_alpha
  }

  powers <- pnorm(z_beta)
  powers <- pmin(pmax(powers, 0), 1)
  powers
}

compute_power_binary <- function(effect_sizes, p1, n_total, alpha,
                                  allocation_ratio, design) {
  p2 <- p1 + effect_sizes

  # Identify invalid draws (p2 out of bounds)
  invalid <- (p2 <= 0) | (p2 >= 1)
  clamped_count <- as.integer(sum(invalid))

  # Work with valid draws only (clip to avoid NaN)
  p2_valid <- pmin(pmax(p2, 1e-10), 1 - 1e-10)
  effect <- abs(p2_valid - p1)

  if (design == "superiority") {
    alpha_adj <- alpha / 2
  } else {
    alpha_adj <- alpha
  }

  z_alpha <- qnorm(1 - alpha_adj)

  if (allocation_ratio == 1.0) {
    p_pooled <- (p1 + p2_valid) / 2
    n_treatment <- n_total / 2.0
    z_beta <- (sqrt(n_treatment) * effect -
               z_alpha * sqrt(2 * p_pooled * (1 - p_pooled))) /
              sqrt(p1 * (1 - p1) + p2_valid * (1 - p2_valid))
  } else {
    r <- allocation_ratio
    p_pooled <- (p1 + r * p2_valid) / (1 + r)
    n_treatment <- n_total * r / (1 + r)
    z_beta <- (sqrt(n_treatment) * effect -
               z_alpha * sqrt(p_pooled * (1 - p_pooled) * (1 + 1 / r))) /
              sqrt(p1 * (1 - p1) / r + p2_valid * (1 - p2_valid))
  }

  powers <- pnorm(z_beta)
  powers <- pmin(pmax(powers, 0), 1)

  # Set power to 0 for invalid draws
  powers[invalid] <- 0.0

  list(powers = powers, clamped_count = clamped_count)
}

calculate_bayesian_assurance <- function(endpoint_type, prior_mean, prior_sd,
                                         n_total, alpha = 0.05,
                                         allocation_ratio = 1.0,
                                         design = "superiority",
                                         simulations = 100000L, seed = 42L,
                                         std_dev = NULL, p1 = NULL) {
  # Draw effect sizes from the prior
  set.seed(seed)
  effect_draws <- rnorm(simulations, mean = prior_mean, sd = prior_sd)

  # Compute power for each draw
  if (endpoint_type == "continuous") {
    powers <- compute_power_continuous(
      effect_draws, std_dev, n_total, alpha, allocation_ratio, design
    )
    clamped_count <- NULL
  } else {
    result_bin <- compute_power_binary(
      effect_draws, p1, n_total, alpha, allocation_ratio, design
    )
    powers <- result_bin$powers
    clamped_count <- result_bin$clamped_count
  }

  # Assurance = mean power across prior draws
  assurance <- mean(powers)
  power_sd_val <- sd(powers)
  monte_carlo_se <- power_sd_val / sqrt(simulations)

  # Power at the prior mean (point estimate)
  if (endpoint_type == "continuous") {
    power_at_prior_mean <- compute_power_continuous(
      prior_mean, std_dev, n_total, alpha, allocation_ratio, design
    )
  } else {
    result_point <- compute_power_binary(
      prior_mean, p1, n_total, alpha, allocation_ratio, design
    )
    power_at_prior_mean <- result_point$powers
  }
  power_at_prior_mean <- as.numeric(power_at_prior_mean[1])

  # Format allocation ratio string
  if (allocation_ratio != 1.0) {
    alloc_str <- paste0(format(allocation_ratio, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  # Build result
  result <- list(
    analysis = "bayesian_assurance",
    endpoint_type = endpoint_type,
    study_design = design,
    prior = list(
      distribution = "normal",
      mean = prior_mean,
      sd = prior_sd
    ),
    planned_sample_size = as.integer(n_total),
    alpha = alpha,
    allocation_ratio = alloc_str
  )

  if (endpoint_type == "continuous") {
    result$standard_deviation <- std_dev
  } else {
    result$control_proportion <- p1
  }

  result$power_at_prior_mean <- round(power_at_prior_mean, 6)
  result$assurance <- round(assurance, 6)

  simulation_block <- list(
    n_simulations = as.integer(simulations),
    seed = as.integer(seed),
    power_sd = round(power_sd_val, 6),
    monte_carlo_se = round(monte_carlo_se, 6)
  )

  if (endpoint_type == "binary") {
    simulation_block$clamped_draws <- as.integer(clamped_count)
    simulation_block$clamped_fraction <- round(clamped_count / simulations, 6)
  }

  result$simulation <- simulation_block

  # Assumptions
  assumptions <- c(
    "Normal prior on treatment effect size",
    paste0("Prior mean of ", prior_mean, " with SD of ", prior_sd)
  )
  if (endpoint_type == "continuous") {
    assumptions <- c(
      assumptions,
      paste0("Common standard deviation of ", std_dev),
      "Normally distributed continuous outcome",
      "Equal variances between groups"
    )
  } else {
    assumptions <- c(
      assumptions,
      paste0("Control group proportion of ", p1),
      "Binary outcome (success/failure)",
      "Large enough sample for normal approximation"
    )
  }
  assumptions <- c(assumptions, "Independent observations")

  result$assumptions <- assumptions

  result$disclaimers <- c(
    "Assurance calculation is preliminary and based on assumed prior",
    "Prior distribution should be informed by available evidence",
    "Final analysis requires biostatistician review"
  )

  result
}


# --- Argument parsing ---

parse_args <- function(args) {
  defaults <- list(
    type = NULL,
    prior_mean = NULL,
    prior_sd = NULL,
    n_total = NULL,
    std_dev = NULL,
    p1 = NULL,
    alpha = 0.05,
    allocation = 1.0,
    design = "superiority",
    simulations = 100000L,
    seed = 42L,
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
      "--prior-mean" = { defaults$prior_mean <- as.numeric(val) },
      "--prior-sd" = { defaults$prior_sd <- as.numeric(val) },
      "--n-total" = { defaults$n_total <- as.integer(val) },
      "--std-dev" = { defaults$std_dev <- as.numeric(val) },
      "--p1" = { defaults$p1 <- as.numeric(val) },
      "--alpha" = { defaults$alpha <- as.numeric(val) },
      "--allocation" = { defaults$allocation <- as.numeric(val) },
      "--design" = { defaults$design <- val },
      "--simulations" = { defaults$simulations <- as.integer(val) },
      "--seed" = { defaults$seed <- as.integer(val) },
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
  if (is.null(defaults$prior_mean)) {
    stop("--prior-mean is required")
  }
  if (is.null(defaults$prior_sd)) {
    stop("--prior-sd is required")
  }
  if (is.null(defaults$n_total)) {
    stop("--n-total is required")
  }

  defaults
}


main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  if (args$type == "continuous") {
    if (is.null(args$std_dev)) {
      stop("--std-dev required for continuous endpoints")
    }
  } else {
    if (is.null(args$p1)) {
      stop("--p1 required for binary endpoints")
    }
  }

  result <- calculate_bayesian_assurance(
    endpoint_type = args$type,
    prior_mean = args$prior_mean,
    prior_sd = args$prior_sd,
    n_total = args$n_total,
    alpha = args$alpha,
    allocation_ratio = args$allocation,
    design = args$design,
    simulations = args$simulations,
    seed = args$seed,
    std_dev = args$std_dev,
    p1 = args$p1
  )

  # Check for errors
  if (!is.null(result$error)) {
    message(paste("ERROR:", result$error))
    quit(status = 1)
  }

  # Convert to JSON with 2-space indent to match Python output
  json_str <- jsonlite::toJSON(result, auto_unbox = TRUE, pretty = FALSE,
                                digits = NA)
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
