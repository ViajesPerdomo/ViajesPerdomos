import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carpeta donde se guardarán los JSON (fuera de src, en la raíz del proyecto)
const DATA_DIR = path.join(__dirname, '../data');

const app = express();
app.use(cors());
app.use(express.json());

// Servir los archivos estáticos (tus dos HTML)
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// FUNCIONES DE ARCHIVOS JSON
// ==========================================
const getFilePath = (name) => path.join(DATA_DIR, `${name}.json`);

async function leerJSON(name) {
  try {
    const data = await fs.readFile(getFilePath(name), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return null; // Si no existe, devuelve null
    throw error;
  }
}

async function guardarJSON(name, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(getFilePath(name), JSON.stringify(data, null, 2), 'utf8');
}

// ==========================================
// DATOS INICIALES (SEED)
// Si Render se reinicia y borra los JSON, esto los vuelve a crear.
// ==========================================
async function inicializarDatos() {
  const guaguasExistentes = await leerJSON('guaguas');
  
  if (!guaguasExistentes) {
    console.log('🌱 Creando archivos JSON iniciales...');
    
    const guaguasIniciales = [
      { id: "1", unidad: "Yutong A1", region: "este", origen: "La Habana", destino: "Santiago de Cuba", precio: 8500, moneda: "CUP", duracion: "12h 30min", salida: "18:00", asientos: 45, asientosDisp: 45, oferta: true, activa: true, imagen: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80", descripcion: "Guagua Yutong de larga distancia con aire acondicionado, WiFi a bordo y asientos reclinables." },
      { id: "2", unidad: "Yutong B2", region: "oeste", origen: "La Habana", destino: "Varadero", precio: 1200, moneda: "CUP", duracion: "2h 30min", salida: "08:00", asientos: 30, asientosDisp: 30, oferta: false, activa: true, imagen: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800&q=80", descripcion: "Guagua Yutong climatizada con salidas cada 2 horas hacia el balneario de Varadero." },
      { id: "3", unidad: "Yutong C3", region: "centro", origen: "La Habana", destino: "Trinidad", precio: 1500, moneda: "CUP", duracion: "5 horas", salida: "07:30", asientos: 28, asientosDisp: 28, oferta: true, activa: true, imagen: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80", descripcion: "Ruta panorámica por la costa con parada de 30 min en Cienfuegos." },
      { id: "4", unidad: "Yutong D4", region: "este", origen: "La Habana", destino: "Holguín", precio: 9200, moneda: "CUP", duracion: "11 horas", salida: "19:00", asientos: 40, asientosDisp: 40, oferta: false, activa: true, imagen: "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800&q=80", descripcion: "Guagua Yutong de largo recorrido con servicio de refrigerio y películas a bordo." },
      { id: "5", unidad: "Yutong E5", region: "centro", origen: "Camagüey", destino: "Santa Clara", precio: 950, moneda: "CUP", duracion: "3h 15min", salida: "14:00", asientos: 35, asientosDisp: 35, oferta: false, activa: true, imagen: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80", descripcion: "Ruta cómoda entre provincias centrales con paradas intermedias en Ciego de Ávila." },
      { id: "6", unidad: "Yutong VIP", region: "especial", origen: "Varadero", destino: "Cayo Blanco", precio: 55, moneda: "MLC", duracion: "8 horas", salida: "09:00", asientos: 15, asientosDisp: 15, oferta: true, activa: true, imagen: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80", descripcion: "Excursión VIP con catamarán, snorkel, almuerzo con langosta y barra libre en el cayo." },
      { id: "7", unidad: "Yutong F7", region: "este", origen: "Santiago de Cuba", destino: "La Habana", precio: 8100, moneda: "CUP", duracion: "12h 30min", salida: "17:30", asientos: 42, asientosDisp: 42, oferta: false, activa: true, imagen: "https://images.unsplash.com/photo-1583500178450-e59e4309b57a?w=800&q=80", descripcion: "Vuelta nocturna en guagua Yutong con selección de asiento." },
      { id: "8", unidad: "Yutong G8", region: "centro", origen: "Trinidad", destino: "Valle de los Ingenios", precio: 35, moneda: "MLC", duracion: "6 horas", salida: "08:30", asientos: 20, asientosDisp: 20, oferta: true, activa: true, imagen: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800&q=80", descripcion: "Tour en guagua Yutong con guía local, visita a la torre Manaca Iznaga y almuerzo criollo." }
    ];

    await guardarJSON('guaguas', guaguasIniciales);
    await guardarJSON('reservas', []);
    console.log('✅ Archivos JSON creados con éxito.');
  }
}

// ==========================================
// ENDPOINTS: GUAGUAS
// ==========================================
app.get('/api/guaguas', async (req, res) => {
  try {
    const guaguas = await leerJSON('guaguas') || [];
    res.json(guaguas);
  } catch (error) {
    res.status(500).json({ error: 'Error leyendo guaguas' });
  }
});

app.post('/api/guaguas', async (req, res) => {
  try {
    const guaguas = await leerJSON('guaguas') || [];
    const nueva = { ...req.body, id: Date.now().toString() };
    guaguas.push(nueva);
    await guardarJSON('guaguas', guaguas);
    res.status(201).json(nueva);
  } catch (error) {
    res.status(500).json({ error: 'Error creando guagua' });
  }
});

app.put('/api/guaguas/:id', async (req, res) => {
  try {
    const guaguas = await leerJSON('guaguas') || [];
    const index = guaguas.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Guagua no encontrada' });
    
    guaguas[index] = { ...guaguas[index], ...req.body };
    await guardarJSON('guaguas', guaguas);
    res.json(guaguas[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando guagua' });
  }
});

app.delete('/api/guaguas/:id', async (req, res) => {
  try {
    let guaguas = await leerJSON('guaguas') || [];
    guaguas = guaguas.filter(g => g.id !== req.params.id);
    await guardarJSON('guaguas', guaguas);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando guagua' });
  }
});

// ==========================================
// ENDPOINTS: RESERVAS
// ==========================================
app.get('/api/reservas', async (req, res) => {
  try {
    const reservas = await leerJSON('reservas') || [];
    res.json(reservas);
  } catch (error) {
    res.status(500).json({ error: 'Error leyendo reservas' });
  }
});

app.post('/api/reservas', async (req, res) => {
  try {
    const { guaguaId, cantidad } = req.body;
    const guaguas = await leerJSON('guaguas') || [];
    const index = guaguas.findIndex(g => g.id === guaguaId);
    
    if (index === -1) return res.status(404).json({ error: 'Guagua no encontrada' });
    if (guaguas[index].asientosDisp < cantidad) return res.status(400).json({ error: 'No hay asientos suficientes' });

    // Crear reserva
    const reservas = await leerJSON('reservas') || [];
    const nuevaReserva = {
      ...req.body,
      id: Date.now().toString(),
      codigo: 'VP-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      total: guaguas[index].precio * cantidad,
      moneda: guaguas[index].moneda,
      estado: 'pendiente',
      createdAt: new Date().toISOString()
    };
    reservas.push(nuevaReserva);

    // Descontar asientos
    guaguas[index].asientosDisp -= cantidad;

    // Guardar ambos
    await guardarJSON('reservas', reservas);
    await guardarJSON('guaguas', guaguas);

    res.status(201).json(nuevaReserva);
  } catch (error) {
    res.status(500).json({ error: 'Error creando reserva' });
  }
});

app.put('/api/reservas/:id', async (req, res) => {
  try {
    const reservas = await leerJSON('reservas') || [];
    const index = reservas.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Reserva no encontrada' });
    
    // Si se cancela la reserva, devolvemos los asientos a la guagua
    if (req.body.estado === 'cancelada' && reservas[index].estado !== 'cancelada') {
      const guaguas = await leerJSON('guaguas') || [];
      const gIndex = guaguas.findIndex(g => g.id === reservas[index].guaguaId);
      if (gIndex !== -1) {
        guaguas[gIndex].asientosDisp += reservas[index].cantidad;
        await guardarJSON('guaguas', guaguas);
      }
    }

    reservas[index] = { ...reservas[index], ...req.body };
    await guardarJSON('reservas', reservas);
    res.json(reservas[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando reserva' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    let reservas = await leerJSON('reservas') || [];
    reservas = reservas.filter(r => r.id !== req.params.id);
    await guardarJSON('reservas', reservas);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando reserva' });
  }
});

// ==========================================
// ARRANCAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;

// Iniciar los datos antes de escuchar peticiones
inicializarDatos().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ViajesPerdomos corriendo en puerto ${PORT}`);
  });
});
