use axum::{extract::DefaultBodyLimit, routing::post, Router};
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{info, Level};

mod error;
mod grok;
mod handlers;
mod models;

#[tokio::main]
async fn main() {
    let log_level = if std::env::var("DEBUG_LOGGING").unwrap_or_default() == "true" {
        Level::DEBUG
    } else {
        Level::INFO
    };
    tracing_subscriber::fmt().with_max_level(log_level).init();

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");

    // Serve static files with fallback to index.html
    let serve_dir = ServeDir::new("dist").fallback(ServeFile::new("dist/index.html"));

    let app = Router::new()
        .route("/api/parse", post(handlers::parse_grok_handler))
        .fallback_service(serve_dir)
        .layer(TraceLayer::new_for_http())
        .layer(DefaultBodyLimit::max(256 * 1024)); // 256 KB

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let addr = format!("{}:{}", host, port);
    let listener = TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to port");

    info!("Datadog Grok Tester (Axum) listening on http://{}", addr);

    axum::serve(listener, app).await.expect("Server failed");
}
