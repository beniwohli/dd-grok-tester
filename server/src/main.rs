use axum::{routing::post, Router};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing::{info, Level};

mod error;
mod grok;
mod handlers;
mod models;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");

    // Setup CORS
    let cors = CorsLayer::permissive();

    // Serve static files with fallback to index.html
    let serve_dir = ServeDir::new("dist").fallback(ServeFile::new("dist/index.html"));

    let app = Router::new()
        .route("/api/parse", post(handlers::parse_grok_handler))
        .fallback_service(serve_dir)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to port");

    info!("Datadog Grok Tester (Axum) listening on http://{}", addr);

    axum::serve(listener, app).await.expect("Server failed");
}
