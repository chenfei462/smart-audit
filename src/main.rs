use anyhow::{Context, Result};
use auditlens::cli::{Cli, Commands, ExportFormat, InputFormat};
use auditlens::data_parser::csv_parser::CsvParser;
use auditlens::data_parser::excel_parser::ExcelParser;
use auditlens::data_parser::DataSource;
use auditlens::pdf_report::PdfBranding;
use auditlens::pdf_report::PdfReportGenerator;
use auditlens::report_gen::csv_export::CsvExporter;
use auditlens::report_gen::json_export::JsonExporter;
use auditlens::report_gen::terminal::TerminalReporter;
use auditlens::report_gen::{ReportExport, ReportOutput};
use clap::Parser;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Audit {
            input,
            format,
            config,
            output,
            export_format,
            ..
        } => {
            println!("AuditLens v{}", env!("CARGO_PKG_VERSION"));
            let audit_config = auditlens::load_config(config.as_deref())
                .context("failed to load configuration")?;
            let transactions = match format {
                InputFormat::Csv => CsvParser.parse(&input)?,
                InputFormat::Excel => ExcelParser.parse(&input)?,
            };

            if transactions.is_empty() {
                println!("No transactions found");
                return Ok(());
            }

            let report = auditlens::run_audit(&transactions, &audit_config)?;
            match export_format {
                ExportFormat::Terminal => {
                    TerminalReporter.print_report(&report)?;
                }
                ExportFormat::Json => {
                    let path = output
                        .as_deref()
                        .unwrap_or(std::path::Path::new("audit_report.json"));
                    JsonExporter.export(&report, path)?;
                    TerminalReporter.print_report(&report)?;
                }
                ExportFormat::Csv => {
                    let path = output
                        .as_deref()
                        .unwrap_or(std::path::Path::new("audit_report.csv"));
                    CsvExporter.export(&report, path)?;
                    TerminalReporter.print_report(&report)?;
                }
                ExportFormat::Pdf => {
                    let path = output
                        .as_deref()
                        .unwrap_or(std::path::Path::new("audit_report.pdf"));
                    PdfReportGenerator::generate_with_branding(
                        &report,
                        path,
                        &PdfBranding::default(),
                    )?;
                    TerminalReporter.print_report(&report)?;
                }
            }

            println!(
                "\n{}",
                auditlens::ai_analysis::generate_local_analysis(&report)
            );
            Ok(())
        }
        Commands::Web { host, port } => {
            auditlens::web::start_server(&host, port).await?;
            Ok(())
        }
        Commands::ValidateConfig { config } => {
            println!("Validating config: {}", config.display());
            match auditlens::load_config(Some(&config)) {
                Ok(_) => {
                    println!("Config is valid");
                    Ok(())
                }
                Err(error) => {
                    println!("Config is invalid: {}", error);
                    Err(error)
                }
            }
        }
    }
}
