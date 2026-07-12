#!/usr/bin/env Rscript
#
# Adaptive Design Operating Characteristics Calculator
#
# Two-stage adaptive design with sample size re-estimation using the inverse
# normal combination test. Computes operating characteristics via simulation.
#

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

simulate_adaptive <- function(effect_size, std_dev, n1, n2_initial, n2_max,
                               alpha, futility_bound, promising_lower,
                               promising_upper, simulations, seed) {
  z_alpha <- qnorm(1 - alpha)

  # Fixed weights based on original plan
  t1 <- n1 / (n1 + n2_initial)
  w1 <- sqrt(t1)
  w2 <- sqrt(1 - t1)

  # Non-centrality parameter for stage 1
  theta1 <- effect_size * sqrt(n1) / (std_dev * sqrt(2))

  set.seed(seed)

  # Stage 1
  z1 <- rnorm(simulations, mean = theta1, sd = 1.0)

  # Conditional power with initial n2
  theta2_initial <- z1 * sqrt(n2_initial / n1)
  cp_initial <- 1.0 - pnorm((z_alpha - w1 * z1) / w2 - theta2_initial)

  # Determine adapted n2
  n2_actual <- rep(as.numeric(n2_initial), simulations)
  stopped_futility <- rep(FALSE, simulations)
  increased_n2 <- rep(FALSE, simulations)

  # Futility zone
  futility_mask <- cp_initial < futility_bound
  stopped_futility[futility_mask] <- TRUE

  # Promising zone
  promising_mask <- (cp_initial >= promising_lower) &
                    (cp_initial < promising_upper) &
                    !futility_mask

  if (any(promising_mask)) {
    target_cp <- 0.8
    z_target <- qnorm(1 - target_cp)
    z1_promising <- z1[promising_mask]

    rhs <- (z_alpha - w1 * z1_promising) / w2 - z_target
    ratio <- rhs / z1_promising

    # Guard: if Z1 <= 0, set to n2_max
    valid <- z1_promising > 0
    n2_solved <- rep(as.numeric(n2_max), length(z1_promising))
    n2_solved[valid] <- ceiling(n1 * ratio[valid]^2)
    n2_solved <- pmin(pmax(n2_solved, n2_initial), n2_max)

    n2_actual[promising_mask] <- n2_solved
    increased_n2[promising_mask] <- n2_solved > n2_initial
  }

  # Stage 2
  theta2 <- effect_size * sqrt(n2_actual) / (std_dev * sqrt(2))
  z2 <- rnorm(simulations, mean = theta2, sd = 1.0)

  # Combine
  z_combined <- w1 * z1 + w2 * z2

  # Reject (only if not stopped for futility)
  rejected <- (z_combined > z_alpha) & !stopped_futility

  # Total sample size per trial (2 arms)
  total_n <- ifelse(stopped_futility, 2L * n1, 2L * (n1 + as.integer(n2_actual)))

  power <- mean(rejected)
  expected_n <- mean(total_n)
  prob_futility <- mean(stopped_futility)
  prob_increase <- mean(increased_n2)
  continuing <- !stopped_futility
  mean_n2 <- if (any(continuing)) mean(n2_actual[continuing]) else 0.0
  mc_se <- sd(as.numeric(rejected)) / sqrt(simulations)

  list(
    effect_size = effect_size,
    std_dev = std_dev,
    power = round(power, 6),
    expected_n_total = round(expected_n, 1),
    prob_futility_stop = round(prob_futility, 6),
    prob_sample_size_increase = round(prob_increase, 6),
    mean_n2_per_arm = round(mean_n2, 1),
    monte_carlo_se = round(mc_se, 6)
  )
}

parse_args <- function(args) {
  defaults <- list(
    effect_size = NULL, effect_sizes = NULL, std_dev = NULL,
    n1 = NULL, n2_initial = NULL, n2_max = NULL,
    alpha = 0.025, futility_bound = 0.1,
    promising_lower = 0.3, promising_upper = 0.9,
    simulations = 10000L, seed = 42L, output = NULL
  )

  i <- 1
  while (i <= length(args)) {
    key <- args[i]
    if (i + 1 > length(args)) stop(paste("Missing value for argument:", key))
    val <- args[i + 1]

    switch(key,
      "--effect-size" = { defaults$effect_size <- as.numeric(val) },
      "--effect-sizes" = { defaults$effect_sizes <- val },
      "--std-dev" = { defaults$std_dev <- as.numeric(val) },
      "--n1" = { defaults$n1 <- as.integer(val) },
      "--n2-initial" = { defaults$n2_initial <- as.integer(val) },
      "--n2-max" = { defaults$n2_max <- as.integer(val) },
      "--alpha" = { defaults$alpha <- as.numeric(val) },
      "--futility-bound" = { defaults$futility_bound <- as.numeric(val) },
      "--promising-lower" = { defaults$promising_lower <- as.numeric(val) },
      "--promising-upper" = { defaults$promising_upper <- as.numeric(val) },
      "--simulations" = { defaults$simulations <- as.integer(val) },
      "--seed" = { defaults$seed <- as.integer(val) },
      "--output" = { defaults$output <- val },
      stop(paste("Unknown argument:", key))
    )
    i <- i + 2
  }

  if (is.null(defaults$std_dev)) stop("--std-dev is required")
  if (is.null(defaults$n1)) stop("--n1 is required")
  if (is.null(defaults$n2_initial)) stop("--n2-initial is required")
  if (is.null(defaults$n2_max)) stop("--n2-max is required")
  if (is.null(defaults$effect_size) && is.null(defaults$effect_sizes)) {
    stop("Either --effect-size or --effect-sizes is required")
  }

  defaults
}

main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  if (!is.null(args$effect_sizes)) {
    effect_sizes <- as.numeric(strsplit(args$effect_sizes, ",")[[1]])
  } else {
    effect_sizes <- args$effect_size
  }

  t1 <- args$n1 / (args$n1 + args$n2_initial)
  w1 <- round(sqrt(t1), 6)
  w2 <- round(sqrt(1 - t1), 6)

  results <- list()
  for (i in seq_along(effect_sizes)) {
    res <- simulate_adaptive(
      effect_size = effect_sizes[i], std_dev = args$std_dev,
      n1 = args$n1, n2_initial = args$n2_initial, n2_max = args$n2_max,
      alpha = args$alpha, futility_bound = args$futility_bound,
      promising_lower = args$promising_lower,
      promising_upper = args$promising_upper,
      simulations = args$simulations, seed = args$seed)
    results[[i]] <- res
  }

  output <- list(
    analysis = "adaptive_design_oc",
    design = list(
      n1_per_arm = args$n1,
      n2_initial_per_arm = args$n2_initial,
      n2_max_per_arm = args$n2_max,
      alpha = args$alpha,
      weights = list(w1 = w1, w2 = w2),
      futility_bound = args$futility_bound,
      promising_zone = c(args$promising_lower, args$promising_upper)
    ),
    results = results,
    simulation = list(
      n_simulations = args$simulations,
      seed = args$seed
    ),
    assumptions = c(
      "Two-stage adaptive design with sample size re-estimation",
      "Inverse normal combination test with fixed pre-planned weights",
      "Continuous endpoint with known standard deviation",
      "Independent observations within and between stages",
      "Normally distributed outcome"
    ),
    disclaimers = c(
      "Operating characteristics are based on simulation and subject to Monte Carlo error",
      "Final adaptive design requires biostatistician review and validation",
      "FDA Pre-Submission meeting recommended for adaptive designs",
      "All adaptations must be prospectively planned per FDA 2016 guidance"
    )
  )

  json_str <- jsonlite::toJSON(output, auto_unbox = TRUE, pretty = FALSE, digits = NA)
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
