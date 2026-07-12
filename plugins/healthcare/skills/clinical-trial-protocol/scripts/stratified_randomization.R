#!/usr/bin/env Rscript
#
# Stratified Randomization Planner for Clinical Trial Design
#
# Generates permuted block randomization sequences within strata, computes
# balance metrics, and supports varying block sizes to prevent prediction.
#

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

generate_blocks <- function(n_per_stratum, allocation_ratio, block_sizes, seed) {
  set.seed(seed)
  r <- allocation_ratio
  unit_size <- r + 1

  assignments <- character(0)
  blocks_used <- integer(0)

  while (length(assignments) < n_per_stratum) {
    bsize <- sample(block_sizes, 1)
    n_units <- bsize / unit_size
    if (n_units != as.integer(n_units)) next
    n_units <- as.integer(n_units)

    block <- c(rep("T", as.integer(n_units * r)), rep("C", n_units))
    block <- sample(block)

    remaining <- n_per_stratum - length(assignments)
    assignments <- c(assignments, block[1:min(length(block), remaining)])
    blocks_used <- c(blocks_used, bsize)
  }

  assignments <- assignments[1:n_per_stratum]
  list(assignments = assignments, blocks_used = blocks_used)
}

compute_balance <- function(assignments) {
  n_t <- sum(assignments == "T")
  n_c <- length(assignments) - n_t
  imbalance <- abs(n_t - n_c)

  count_t <- 0L
  count_c <- 0L
  max_imbalance <- 0L
  for (a in assignments) {
    if (a == "T") count_t <- count_t + 1L else count_c <- count_c + 1L
    imb <- abs(count_t - count_c)
    if (imb > max_imbalance) max_imbalance <- imb
  }

  list(
    n_treatment = as.integer(n_t),
    n_control = as.integer(n_c),
    final_imbalance = as.integer(imbalance),
    max_running_imbalance = as.integer(max_imbalance)
  )
}

validate_block_sizes <- function(block_sizes, allocation_ratio) {
  unit <- allocation_ratio + 1
  block_sizes[block_sizes / unit == as.integer(block_sizes / unit)]
}

parse_args <- function(args) {
  defaults <- list(
    strata = NULL, n_per_stratum = NULL, block_sizes = "4,6,8",
    allocation = 1.0, seed = 42L, output = NULL
  )

  i <- 1
  while (i <= length(args)) {
    key <- args[i]
    if (i + 1 > length(args)) stop(paste("Missing value for argument:", key))
    val <- args[i + 1]

    switch(key,
      "--strata" = { defaults$strata <- val },
      "--n-per-stratum" = { defaults$n_per_stratum <- val },
      "--block-sizes" = { defaults$block_sizes <- val },
      "--allocation" = { defaults$allocation <- as.numeric(val) },
      "--seed" = { defaults$seed <- as.integer(val) },
      "--output" = { defaults$output <- val },
      stop(paste("Unknown argument:", key))
    )
    i <- i + 2
  }

  if (is.null(defaults$strata)) stop("--strata is required")
  if (is.null(defaults$n_per_stratum)) stop("--n-per-stratum is required")
  defaults
}

main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  strata <- strsplit(args$strata, ",")[[1]]
  block_sizes <- as.integer(strsplit(args$block_sizes, ",")[[1]])
  n_values <- as.integer(strsplit(args$n_per_stratum, ",")[[1]])

  if (length(n_values) == 1) {
    n_values <- rep(n_values, length(strata))
  } else if (length(n_values) != length(strata)) {
    message("ERROR: --n-per-stratum must be a single value or match number of strata")
    quit(status = 1)
  }

  valid_blocks <- validate_block_sizes(block_sizes, args$allocation)
  if (length(valid_blocks) == 0) {
    message(paste0("ERROR: No block sizes are divisible by ", args$allocation + 1,
                   " (allocation ratio + 1). Provide valid block sizes."))
    quit(status = 1)
  }

  strata_results <- list()
  total_t <- 0L
  total_c <- 0L

  for (i in seq_along(strata)) {
    stratum_seed <- args$seed + i - 1L
    res <- generate_blocks(n_values[i], args$allocation, valid_blocks, stratum_seed)
    balance <- compute_balance(res$assignments)

    total_t <- total_t + balance$n_treatment
    total_c <- total_c + balance$n_control

    strata_results[[i]] <- list(
      stratum = strata[i],
      n_subjects = as.integer(n_values[i]),
      n_treatment = balance$n_treatment,
      n_control = balance$n_control,
      final_imbalance = balance$final_imbalance,
      max_running_imbalance = balance$max_running_imbalance,
      blocks_used = res$blocks_used,
      n_blocks = as.integer(length(res$blocks_used))
    )
  }

  if (args$allocation != 1.0) {
    alloc_str <- paste0(format(args$allocation, nsmall = 1), ":1")
  } else {
    alloc_str <- "1:1"
  }

  total_n <- as.integer(total_t + total_c)

  result <- list(
    analysis = "stratified_randomization",
    n_strata = as.integer(length(strata)),
    allocation_ratio = alloc_str,
    block_sizes_available = valid_blocks,
    seed = args$seed,
    overall = list(
      total_subjects = total_n,
      total_treatment = as.integer(total_t),
      total_control = as.integer(total_c),
      overall_imbalance = as.integer(abs(total_t - total_c))
    ),
    strata = strata_results,
    assumptions = c(
      "Permuted block randomization within each stratum",
      "Randomly varying block sizes to prevent allocation prediction",
      paste0("Block sizes drawn uniformly from ", jsonlite::toJSON(valid_blocks)),
      "Stratification factors are strong prognostic variables"
    ),
    disclaimers = c(
      "Randomization plan is preliminary and requires unblinded statistician review",
      "Final randomization should use a validated IWRS/IXRS system",
      "Block sizes should remain confidential to prevent prediction",
      "Consider Pocock-Simon minimization for >4 stratification factors"
    )
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
