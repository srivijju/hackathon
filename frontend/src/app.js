import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [result, setResult] = useState('');

    const handleFileChange = (event) => {
        setSelectedFile(event.target.files[0]);
    };

    const handleUpload = async () => {
        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            // Send request to the correct backend endpoint (/classify)
            const response = await axios.post('http://localhost:5001/classify', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            setResult(response.data.result); // Assuming the response contains a 'result' key
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    };

    return (
        <div className="App">
            <h1>Image Classification</h1>
            <input type="file" onChange={handleFileChange} />
            <button onClick={handleUpload}>Upload</button>
            {result && <p>Result: {result}</p>}
        </div>
    );
}

export default App;
