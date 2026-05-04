import { Route, Routes } from 'react-router-dom';
import AdminDashboard from './routes/admin/Dashboard.js';
import AdminLogin from './routes/admin/Login.js';
import Gallery from './routes/Gallery.js';
import Home from './routes/Home.js';
import Upload from './routes/Upload.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/enviar" element={<Upload />} />
      <Route path="/galeria" element={<Gallery />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/*" element={<AdminDashboard />} />
    </Routes>
  );
}
