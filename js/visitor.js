  // Function to fetch visitor's IP address and location information
  function fetchVisitorInfo() {
    fetch('http://ip-api.com/json')
      .then(response => response.json())
      .then(data => {
        const ipAddress = data.query;
        const location = `${data.city}, ${data.regionName}`;

        document.getElementById('ip-address').textContent = ipAddress;
        document.getElementById('location').textContent = location;
      })
      .catch(error => console.error('Error fetching visitor info:', error));
  }

  // Call the function to fetch visitor information when the page loads
  fetchVisitorInfo();
