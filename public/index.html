<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Clinic Report Form</title>
</head>
<body>
  <h2>Submit Clinic Report</h2>
  <form id="reportForm">
    <input name="username" placeholder="Username" required /><br><br>
    <select name="clinic" required>
      <option value="">Select Clinic</option>
      <option value="Kisiwani">Kisiwani</option>
      <option value="Jirambe">Jirambe</option>
      <option value="Mikwambe">Mikwambe</option>
      <option value="Kibada">Kibada</option>
    </select><br><br>
    <input name="title" placeholder="Title" required /><br><br>
    <textarea name="description" placeholder="Description" required></textarea><br><br>
    <input type="file" name="image" accept="image/*" /><br><br>
    <button type="submit">Submit</button>
  </form>

  <p id="status"></p>

  <script>
    const form = document.getElementById('reportForm');
    const status = document.getElementById('status');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = 'Submitting...';

      const formData = new FormData(form);

      try {
        const res = await fetch('/api/report', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (!res.ok) {
          status.textContent = 'Error: ' + (data.error || 'Unknown error');
          return;
        }

        status.textContent = data.message || 'Report submitted successfully!';
        setTimeout(() => window.location.href = '/report.html', 1000);

      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }
    });
  </script>
</body>
</html>
