"""
Report Generator using Groq API

Converts trace JSON into a professional narrative investment report.
Uses Groq for fast, free LLM inference.
"""

import json
import os
import logging
from pathlib import Path

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

from dotenv import load_dotenv
load_dotenv()  # Load .env file

logger = logging.getLogger(__name__)


def generate_narrative_report(trace_json_path: str, api_key: str = None) -> str:
    """
    Load trace JSON and generate a formatted narrative report using Groq.
    
    Args:
        trace_json_path: Path to the trace JSON file
        api_key: Groq API key (defaults to GROQ_API_KEY env var)
    
    Returns:
        Formatted narrative report as string
    """
    if not GROQ_AVAILABLE:
        logger.warning("Groq SDK not installed. Install with: pip install groq")
        return "Groq SDK not available. Install with: pip install groq"
    
    # Load trace
    trace_path = Path(trace_json_path)
    if not trace_path.exists():
        logger.error(f"Trace file not found: {trace_json_path}")
        return f"Error: trace file not found at {trace_json_path}"
    
    with open(trace_path) as f:
        trace = json.load(f)
    
    # Get API key
    api_key = api_key or os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY not set. Sign up at https://console.groq.com")
        return "Error: GROQ_API_KEY environment variable not set"
    
    # Build prompt
    prompt = f"""You are an elite quantitative and qualitative investment analyst. Your task is to analyze the provided AlphaSwarm JSON trace data and generate a comprehensive, client-ready investment report. 
    
    TRACE DATA:
{json.dumps(trace, indent=2)}

You are an elite quantitative and qualitative investment analyst. Your task is to analyze the provided AlphaSwarm JSON trace data and generate a comprehensive, client-ready investment report. 

CRITICAL CONSTRAINT: You must base your entire analysis strictly and exclusively on the information contained within the provided JSON file. Do not hallucinate, infer, or inject any external market data, historical facts, or outside opinions that are not explicitly stated in the JSON trace.

Please structure your report using clean Markdown formatting, adhering to the following sections:

# 1. Executive Summary
*   State the Run ID, User ID, Date of Analysis, and the specified Risk Tolerance.
*   List the market Universes analyzed.
*   Provide a brief 1-2 sentence high-level summary of the final output (e.g., "The model identified 5 assets from an initial pool of 15, favoring high-momentum clean energy and tech equities").

# 2. Methodology & Synthesis Overview
*   Briefly explain the scoring components based on the data: Quant Score, Sentiment Score, and the Final Unified Score.
*   Mention that no hype or risk penalties were applied in this run (based on the `adjustments` data).

# 3. Top 5 Asset Profiles
For each of the assets in the `final_rankings` array, create a dedicated subsection formatted as follows:
*   **[Ticker Symbol] - [Unified Score]**
*   **Quantitative Breakdown:** Detail the Quant Score, RSI, MACD signal, Sharpe Ratio, Beta, and Volatility using the data from `quant_metrics`.
*   **Sentiment Narrative:** Detail the Sentiment Score, Bullish vs. Bearish post count, and synthesize a brief 2-3 sentence narrative summarizing *why* the sentiment is what it is, using ONLY the text from the `top_posts` array. 

# 4. Risk & Volatility Summary
*   Provide a brief comparison of the Top 5 assets based on their Beta and Volatility metrics provided in the trace. Identify which asset acts as the strongest diversifier (lowest correlation/beta) and which carries the highest growth volatility.

Maintain a highly professional, objective, and analytical tone throughout the report.

"""

    try:
        client = Groq(api_key=api_key)
        
        message = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",  # Fast and free on Groq
            max_tokens=2048,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        report = message.choices[0].message.content
        logger.info(f"Generated narrative report from trace {trace.get('run_id')}")
        return report
    
    except Exception as e:
        logger.error(f"Failed to generate report with Groq: {e}")
        return f"Error generating report: {str(e)}"


def save_report(report: str, output_path: str = None) -> str:
    """
    Save the generated report to a file.
    
    Args:
        report: The narrative report text
        output_path: Path to save to (defaults to data/reports/{run_id}.md)
    
    Returns:
        Path where report was saved
    """
    if not output_path:
        output_path = "data/reports/report.md"
    
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, "w") as f:
        f.write(report)
    
    logger.info(f"Report saved to {output_file}")
    return str(output_file)


if __name__ == "__main__":
    # Test: generate report from run_001 trace
    trace_file = "data/runs/run_001.trace.json"
    if Path(trace_file).exists():
        report = generate_narrative_report(trace_file)
        print(report)
        report_path = save_report(report, "data/reports/run_001.md")
        print(f"\nReport saved to: {report_path}")
    else:
        print(f"Trace file not found: {trace_file}")
