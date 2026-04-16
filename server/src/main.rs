use axum::{
    routing::post,
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use std::net::SocketAddr;
use tracing::{info, Level};
use tracing_subscriber;

mod models;
mod handlers;
mod grok;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("Starting Datadog Grok Tester server...");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_router = Router::new()
        .route("/parse", post(handlers::parse_grok_handler));

    let app = Router::new()
        .nest("/api", api_router)
        .fallback_service(ServeDir::new("./dist"))
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
