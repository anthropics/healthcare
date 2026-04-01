#!/usr/bin/env Rscript
#
# Sensitivity Table Generator for Clinical Trial Design
#
# Generates a 2D grid of total sample sizes (with dropout adjustment) across
# combinations of two varying parameters. Outputs JSON.
#

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

PARAM_NAMES <- list(
  "effect-size" = "effect_size",
  "std-dev" = "std_dev",
  "dropout" = "dropout_rate",
  "power" = "power",
  "alpha" = "alpha",
  "p1" = "p1",
  "p2" = "p2"
)

compute_continuous <- function(effect_size, std_dev, alpha, power,
                               allocation_ratio, dropout_rate, design) {
  cohens_d <- abs(effect_size) / std_dev
  alpha_adj <- if (design == "superiority") alpha / 2 else alpha
  z_alpha <- qnorm(1 - alpha_adj)
  z_beta <- qnorm(power)

  if (allocation_ratio == 1.0) {
    n_per_arm <- 2 * ((z_alpha + z_beta)^2) / (cohens_d^2)
  } else {
    n_per_arm <- ((1 + 1 / allocation_ratio)^2) * ((z_alpha + z_beta)^2) / (cohens_d^2)
  }

  n_per_arm <- as.integer(ceiling(n_per_arm))
  if (allocation_ratio == 1.0) {
    total <- as.integer(n_per_arm * 2L)
  } else {
    total <- as.integer(n_per_arm + as.integer(ceiling(n_per_arm / allocation_ratio)))
  }

  as.integer(ceiling(total / (1 - dropout_rate)))
}

compute_binary <- function(p1, p2, alpha, power,
                           allocation_ratio, dropout_rate, design) {
  alpha_adj <- if (design == "superiority") alpha / 2 else alpha
  z_alpha <- qnorm(1 - alpha_adj)
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
    total <- as.integer(n_treatment * 2L)
  } else {
    total <- as.integer(n_treatment + as.integer(ceiling(n_treatment / allocation_ratio)))
  }

  as.integer(ceiling(total / (1 - dropout_rate)))
}

parse_args <- function(args) {
  defaults <- list(
    type = NULL, row_param = NULL, col_param = NULL,
    row_values = NULL, col_values = NULL,
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
      "--row-param" = { defaults$row_param <- val },
      "--col-param" = { defaults$col_param <- val },
      "--row-values" = { defaults$row_values <- as.numeric(strsplit(val, ",")[[1]]) },
      "--col-values" = { defaults$col_values <- as.numeric(strsplit(val, ",")[[1]]) },
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
  if (is.null(defaults$row_param)) stop("--row-param is required")
  if (is.null(defaults$col_param)) stop("--col-param is required")
  if (is.null(defaults$row_values)) stop("--row-values is required")
  if (is.null(defaults$col_values)) stop("--col-values is required")
  defaults
}

main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  # Build base params
  base <- list(
    alpha = args$alpha,
    power = args$power,
    dropout_rate = args$dropout,
    allocation_ratio = args$allocation,
    design = args$design
  )
  if (args$type == "continuous") {
    if (!is.null(args$effect_size)) base$effect_size <- args$effect_size
    if (!is.null(args$std_dev)) base$std_dev <- args$std_dev
  } else {
    if (!is.null(args$p1)) base$p1 <- args$p1
    if (!is.null(args$p2)) base$p2 <- args$p2
  }

  row_pname <- PARAM_NAMES[[args$row_param]]
  col_pname <- PARAM_NAMES[[args$col_param]]

  table_data <- list()
  for (ri in seq_along(args$row_values)) {
    row <- integer(length(args$col_values))
    for (ci in seq_along(args$col_values)) {
      params <- base
      params[[row_pname]] <- args$row_values[ri]
      params[[col_pname]] <- args$col_values[ci]

      if (args$type == "continuous") {
        cell <- compute_continuous(
          params$effect_size, params$std_dev,
          params$alpha, params$power,
          params$allocation_ratio, params$dropout_rate,
          params$design)
      } else {
        cell <- compute_binary(
          params$p1, params$p2,
          params$alpha, params$power,
          params$allocation_ratio, params$dropout_rate,
          params$design)
      }
      row[ci] <- cell
    }
    table_data[[ri]] <- row
  }

  # Build fixed_params
  varied <- c(row_pname, col_pname)
  fixed <- list()
  for (k in names(base)) {
    if (!(k %in% varied)) fixed[[k]] <- base[[k]]
  }

  result <- list(
    endpoint_type = args$type,
    row_param = args$row_param,
    col_param = args$col_param,
    row_values = args$row_values,
    col_values = args$col_values,
    fixed_params = fixed,
    table = table_data
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
