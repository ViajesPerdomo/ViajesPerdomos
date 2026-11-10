import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// CONFIGURACIÓN DE GITHUB
// ==========================================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// Función central para llamar a la API de GitHub
const githubApi = async (endpoint, options = {}) => {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });
  
  if (res.status === 401) {
    console.error("❌ ERROR 401: Token de GitHub inválido o sin permisos.");
    throw new Error("Token de GitHub inválido");
  }
  if (res.status === 404) {
    return res; // 404 es normal si el archivo aún no existe
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    // MEJORA 1: Mostrar el error real de GitHub en la consola y en el mensaje de error
    console.error(`❌ ERROR DE GITHUB (${res.status}):`, errorData.message || res.statusText);
    throw new Error(`GitHub API Error: ${res.status} - ${errorData.message || res.statusText}`);
  }
  return res;
};

// Leer un archivo JSON desde GitHub
async function leerJSON(nombreArchivo) {
  try {
    const res = await githubApi(`${nombreArchivo}.json?ref=${GITHUB_BRANCH}`);
    if (res.status === 404) return null;
    const data = await res.json();
    const contenido = Buffer.from(data.content, 'base64').toString('utf8');
    return { data: JSON.parse(contenido), sha: data.sha };
  } catch (error) {
    console.error(`Error leyendo ${nombreArchivo}:`, error.message);
    return null;
  }
}

// Escribir un archivo JSON en GitHub (crear o actualizar)
async function guardarJSON(nombreArchivo, contenidoJSON) {
  try {
    // 1. Intentamos leer para obtener el SHA actual (si existe)
    const existente = await leerJSON(nombreArchivo);
    
    const body = {
      message: `Actualizar ${nombreArchivo}.json desde Viajes Perdomos`,
      content: Buffer.from(JSON.stringify(contenidoJSON, null, 2)).toString('base64'),
      branch: GITHUB_BRANCH
    };
    
    // MEJORA 2: Aseguramos que si existe, pasamos el SHA
    if (existente && existente.sha) {
      body.sha = existente.sha;
    }

    // 2. Hacemos la petición PUT
    const res = await githubApi(`${nombreArchivo}.json`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Falló el guardado de ${nombreArchivo}`);
    }
    console.log(`✅ ${nombreArchivo}.json guardado en GitHub`);
    return true;
  } catch (error) {
    console.error(`❌ Error guardando ${nombreArchivo}:`, error.message);
    throw error;
  }
}

// ==========================================
// DATOS INICIALES (SEED)
// ==========================================
async function inicializarDatos() {
  try {
    // 1. Guaguas
    const guaguas = await leerJSON('guaguas');
    if (!guaguas) {
      console.log('🌱 Creando guaguas.json...');
      const guaguasIniciales = [
        { id: "1", unidad: "Yutong A1", region: "este", origen: "La Habana", destino: "Santiago de Cuba", precio: 8500, moneda: "CUP", duracion: "12h 30min", salida: "18:00", asientos: 45, asientosDisp: 45, oferta: true, activa: true, imagen: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80", descripcion: "Guagua Yutong de larga distancia." },
        { id: "2", unidad: "Yutong B2", region: "oeste", origen: "La Habana", destino: "Varadero", precio: 1200, moneda: "CUP", duracion: "2h 30min", salida: "08:00", asientos: 30, asientosDisp: 30, oferta: false, activa: true, imagen: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800&q=80", descripcion: "Guagua climatizada." }
      ];
      await guardarJSON('guaguas', guaguasIniciales);
    }

    // 2. Reservas
    const reservas = await leerJSON('reservas');
    if (!reservas) {
      console.log('🌱 Creando reservas.json...');
      await guardarJSON('reservas', []);
    }

    // 3. Usuarios
    const usuarios = await leerJSON('usuarios');
    if (!usuarios) {
      console.log('🌱 Creando usuarios.json...');
      await guardarJSON('usuarios', []);
    }
  } catch (error) {
    console.error("⚠️ Error inicializando datos (revisa el token o los logs de GitHub):", error.message);
  }
}

// ==========================================
// ENDPOINTS: USUARIOS Y LOGIN
// ==========================================
app.get('/api/usuarios', async (req, res) => {
  const data = await leerJSON('usuarios');
  res.json(data ? data.data : []);
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const data = await leerJSON('usuarios');
    const usuarios = data ? data.data : [];

    if (usuarios.find(u => u.email === email)) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    const nuevoUsuario = { id: Date.now().toString(), nombre, email, password };
    usuarios.push(nuevoUsuario);
    await guardarJSON('usuarios', usuarios);
    
    res.status(201).json({ mensaje: 'Usuario creado', usuario: nuevoUsuario });
  } catch (error) {
    res.status(500).json({ error: 'Error interno al registrar' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const data = await leerJSON('usuarios');
    const usuarios = data ? data.data : [];

    const usuario = usuarios.find(u => u.email === email && u.password === password);
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    res.json({ mensaje: 'Login exitoso', usuario });
  } catch (error) {
    res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
});

// ==========================================
// ENDPOINTS: GUAGUAS
// ==========================================
app.get('/api/guaguas', async (req, res) => {
  const data = await leerJSON('guaguas');
  res.json(data ? data.data : []);
});

app.post('/api/guaguas', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas');
    const lista = actual ? actual.data : [];
    const nueva = { ...req.body, id: Date.now().toString() };
    lista.push(nueva);
    await guardarJSON('guaguas', lista);
    res.status(201).json(nueva);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear guagua' });
  }
});

app.put('/api/guaguas/:id', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas');
    const lista = actual ? actual.data : [];
    const index = lista.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'No encontrada' });
    
    lista[index] = { ...lista[index], ...req.body };
    await guardarJSON('guaguas', lista);
    res.json(lista[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar guagua' });
  }
});

app.delete('/api/guaguas/:id', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas');
    const lista = actual ? actual.data.filter(g => g.id !== req.params.id) : [];
    await guardarJSON('guaguas', lista);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar guagua' });
  }
});

// ==========================================
// ENDPOINTS: RESERVAS
// ==========================================
app.get('/api/reservas', async (req, res) => {
  const data = await leerJSON('reservas');
  res.json(data ? data.data : []);
});

app.post('/api/reservas', async (req, res) => {
  try {
    const { guaguaId, cantidad } = req.body;
    const guaguasData = await leerJSON('guaguas');
    const guaguas = guaguasData ? guaguasData.data : [];
    const gIndex = guaguas.findIndex(g => g.id === guaguaId);
    
    if (gIndex === -1) return res.status(404).json({ error: 'Guagua no encontrada' });
    if (guaguas[gIndex].asientosDisp < cantidad) return res.status(400).json({ error: 'Sin asientos disponibles' });

    const reservasData = await leerJSON('reservas');
    const reservas = reservasData ? reservasData.data : [];
    
    const nuevaReserva = {
      ...req.body,
      id: Date.now().toString(),
      codigo: 'VP-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      total: guaguas[gIndex].precio * cantidad,
      moneda: guaguas[gIndex].moneda,
      estado: 'pendiente',
      createdAt: new Date().toISOString()
    };
    reservas.push(nuevaReserva);
    
    // Descontar asientos
    guaguas[gIndex].asientosDisp -= cantidad;

    // Guardar ambos archivos
    await guardarJSON('reservas', reservas);
    await guardarJSON('guaguas', guaguas);

    res.status(201).json(nuevaReserva);
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar la reserva' });
  }
});

app.put('/api/reservas/:id', async (req, res) => {
  try {
    const reservasData = await leerJSON('reservas');
    const reservas = reservasData ? reservasData.data : [];
    const index = reservas.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'No encontrada' });

    // Si se cancela, devolver asientos
    if (req.body.estado === 'cancelada' && reservas[index].estado !== 'cancelada') {
      const guaguasData = await leerJSON('guaguas');
      if (guaguasData) {
        const guaguas = guaguasData.data;
        const gIndex = guaguas.findIndex(g => g.id === reservas[index].guaguaId);
        if (gIndex !== -1) {
          guaguas[gIndex].asientosDisp += reservas[index].cantidad;
          await guardarJSON('guaguas', guaguas);
        }
      }
    }

    reservas[index] = { ...reservas[index], ...req.body };
    await guardarJSON('reservas', reservas);
    res.json(reservas[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar reserva' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const reservasData = await leerJSON('reservas');
    const reservas = reservasData ? reservasData.data.filter(r => r.id !== req.params.id) : [];
    await guardarJSON('reservas', reservas);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar reserva' });
  }
});

// ==========================================
// ARRANCAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
inicializarDatos().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor Viajes Perdomos en puerto ${PORT}`));
});
