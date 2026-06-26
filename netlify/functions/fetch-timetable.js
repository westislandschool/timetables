// netlify/functions/fetch-timetable.js

export const handler = async (event, context) => {
  // Grab the secret Apps Script URL securely from Netlify's environment variables
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;

  if (!appsScriptUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfiguration: APPS_SCRIPT_URL is missing." }),
    };
  }

  try {
    // Fetch the data from Google securely from the cloud side
    const response = await fetch(appsScriptUrl, { 
      method: 'GET', 
      redirect: 'follow' 
    });

    if (!response.ok) {
      throw new Error(`Google returned status ${response.status}`);
    }

    const xmlData = await response.text();

    // Return the raw XML back to your frontend script.js file
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/xml",
        "Access-Control-Allow-Origin": "*", // Safeguards against CORS errors
      },
      body: xmlData,
    };
  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch timetable data dynamically from cloud storage." }),
    };
  }
};