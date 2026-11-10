import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// CONFIGURACIÓN DE GITHUB
// ==========================================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// CACHÉ EN MEMORIA PARA EVITAR LENTITUD
const cache = {
  guaguas: null,
  reservas: null,
  usuarios: null,
  credenciales: null,
  config: null
};

const githubApi = async (endpoint, options = {}) => {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${endpoint}`;
  
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });
  
  if (res.status === 401) throw new Error("401 - Token inválido");
  if (res.status === 404) return res; 
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`GitHub API Error: ${res.status} - ${errorData.message || res.statusText}`);
  }
  return res;
};

async function leerJSON(nombreArchivo, forzarRecarga = false) {
  try {
    // Si está en caché y no se fuerza recarga, devolverlo al instante
    if (cache[nombreArchivo] && !forzarRecarga) {
      return cache[nombreArchivo];
    }

    const res = await githubApi(`${nombreArchivo}.json?ref=${GITHUB_BRANCH}`);
    if (res.status === 404) return null; 
    
    const data = await res.json();
    const contenido = Buffer.from(data.content, 'base64').toString('utf8');
    const resultado = { data: JSON.parse(contenido), sha: data.sha };
    
    // Guardar en caché
    cache[nombreArchivo] = resultado;
    return resultado;
  } catch (error) {
    console.error(`❌ Error leyendo ${nombreArchivo}:`, error.message);
    // Si falla GitHub, intentar devolver lo que haya en caché (si existe)
    if (cache[nombreArchivo]) return cache[nombreArchivo];
    throw error; 
  }
}

async function guardarJSON(nombreArchivo, contenidoJSON, shaExistente = null) {
  try {
    const body = {
      message: `Actualizar ${nombreArchivo}.json desde Viajes Perdomos`,
      content: Buffer.from(JSON.stringify(contenidoJSON, null, 2)).toString('base64'),
      branch: GITHUB_BRANCH
    };
    
    if (shaExistente) body.sha = shaExistente;

    const res = await githubApi(`${nombreArchivo}.json`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Falló el guardado de ${nombreArchivo}`);
    }

    // Actualizar la caché con los nuevos datos
    // Hacemos una lectura rápida para obtener el nuevo SHA
    const nuevoContenido = await leerJSON(nombreArchivo, true);
    cache[nombreArchivo] = nuevoContenido;

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
    console.log("🔄 Iniciando comprobación de datos en GitHub...");

    let guaguasData = null;
    try { guaguasData = await leerJSON('guaguas'); } catch (e) { console.log("Esperando a GitHub..."); }

    if (!guaguasData) {
      console.log('🌱 Creando guaguas.json por primera vez...');
      const guaguasIniciales = [
        { id: "1", unidad: "Yutong A1", region: "este", origen: "La Habana", destino: "Santiago de Cuba", precio: 8500, moneda: "CUP", duracion: "12h 30min", salida: "18:00", asientos: 45, asientosDisp: 45, oferta: true, activa: true, imagen: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80", descripcion: "Guagua Yutong de larga distancia." },
        { id: "2", unidad: "Yutong B2", region: "oeste", origen: "La Habana", destino: "Varadero", precio: 1200, moneda: "CUP", duracion: "2h 30min", salida: "08:00", asientos: 30, asientosDisp: 30, oferta: false, activa: true, imagen: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800&q=80", descripcion: "Guagua climatizada." }
      ];
      await guardarJSON('guaguas', guaguasIniciales); 
    }

    let reservasData = null;
    try { reservasData = await leerJSON('reservas'); } catch(e) {}
    if (!reservasData) await guardarJSON('reservas', []);

    let usuariosData = null;
    try { usuariosData = await leerJSON('usuarios'); } catch(e) {}
    if (!usuariosData) await guardarJSON('usuarios', []);

    let configData = null;
    try { configData = await leerJSON('config'); } catch(e) {}
    if (!configData) {
      console.log('🌱 Creando config.json...');
      await guardarJSON('config', { nombreApp: 'Viajes Perdomo', icono: '🚌', color: '#0f766e', imagenHero: '' });
    }

    console.log("🎉 Inicialización de datos completada.");
  } catch (error) {
    console.error("⚠️ Error crítico inicializando datos:", error.message);
  }
}

// ==========================================
// ENDPOINTS
// ==========================================
app.get('/api/gestores', async (req, res) => {
  try {
    const data = await leerJSON('credenciales');
    const credenciales = data ? data.data : [];
    const gestores = credenciales.filter(c => c.rol === 'gestor').map(c => ({ usuario: c.usuario, nombre: c.nombre }));
    res.json(gestores);
  } catch (error) {
    res.status(500).json({ error: 'Error al leer gestores' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password, gestorCodigo } = req.body;
    if (!gestorCodigo) return res.status(400).json({ error: 'Debes seleccionar un gestor para registrarte' });

    const data = await leerJSON('usuarios');
    const usuarios = data ? data.data : [];
    const sha = data ? data.sha : null;

    if (usuarios.find(u => u.email === email)) return res.status(400).json({ error: 'El correo ya está registrado' });

    const nuevoUsuario = { id: Date.now().toString(), nombre, email, password, gestorCodigo };
    usuarios.push(nuevoUsuario);
    await guardarJSON('usuarios', usuarios, sha);
    
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
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ mensaje: 'Login exitoso', usuario });
  } catch (error) {
    res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
});

app.get('/api/guaguas', async (req, res) => {
  try {
    const data = await leerJSON('guaguas');
    res.json(data ? data.data : []);
  } catch (error) {
    res.status(500).json({ error: 'Error cargando guaguas' });
  }
});

app.post('/api/guaguas', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas', true); // Forzar recarga para tener SHA actualizado
    const lista = actual ? actual.data : [];
    const sha = actual ? actual.sha : null;
    const nueva = { ...req.body, id: Date.now().toString() };
    lista.push(nueva);
    await guardarJSON('guaguas', lista, sha);
    res.status(201).json(nueva);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear guagua' });
  }
});

app.put('/api/guaguas/:id', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas', true);
    const lista = actual ? actual.data : [];
    const sha = actual ? actual.sha : null;
    const index = lista.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'No encontrada' });
    lista[index] = { ...lista[index], ...req.body };
    await guardarJSON('guaguas', lista, sha);
    res.json(lista[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar guagua' });
  }
});

app.delete('/api/guaguas/:id', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas', true);
    const lista = actual ? actual.data.filter(g => g.id !== req.params.id) : [];
    const sha = actual ? actual.sha : null;
    await guardarJSON('guaguas', lista, sha);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar guagua' });
  }
});

app.get('/api/reservas', async (req, res) => {
  try {
    const data = await leerJSON('reservas');
    res.json(data ? data.data : []);
  } catch (error) {
    res.status(500).json({ error: 'Error cargando reservas' });
  }
});

app.post('/api/reservas', async (req, res) => {
  try {
    const { guaguaId, cantidad } = req.body;
    const guaguasData = await leerJSON('guaguas', true); // Forzar recarga
    if (!guaguasData) return res.status(500).json({ error: 'Error leyendo guaguas' });
    
    const guaguas = guaguasData.data;
    const shaGuaguas = guaguasData.sha;
    const gIndex = guaguas.findIndex(g => g.id === guaguaId);
    
    if (gIndex === -1) return res.status(404).json({ error: 'Guagua no encontrada' });
    if (guaguas[gIndex].asientosDisp < cantidad) return res.status(400).json({ error: 'Sin asientos disponibles' });

    const reservasData = await leerJSON('reservas', true);
    const reservas = reservasData ? reservasData.data : [];
    const shaReservas = reservasData ? reservasData.sha : null;
    
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
    guaguas[gIndex].asientosDisp -= cantidad;

    await guardarJSON('reservas', reservas, shaReservas);
    await guardarJSON('guaguas', guaguas, shaGuaguas);

    res.status(201).json(nuevaReserva);
  } catch (error) {
    console.error("Error en reserva:", error.message);
    res.status(500).json({ error: 'Error al procesar la reserva' });
  }
});

app.put('/api/reservas/:id', async (req, res) => {
  try {
    const reservasData = await leerJSON('reservas', true);
    if (!reservasData) return res.status(500).json({ error: 'Error leyendo reservas' });
    
    const reservas = reservasData.data;
    const shaReservas = reservasData.sha;
    const index = reservas.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'No encontrada' });

    if (req.body.estado === 'cancelada' && reservas[index].estado !== 'cancelada') {
      const guaguasData = await leerJSON('guaguas', true);
      if (guaguasData) {
        const guaguas = guaguasData.data;
        const gIndex = guaguas.findIndex(g => g.id === reservas[index].guaguaId);
        if (gIndex !== -1) {
          guaguas[gIndex].asientosDisp += reservas[index].cantidad;
          await guardarJSON('guaguas', guaguas, guaguasData.sha);
        }
      }
    }

    reservas[index] = { ...reservas[index], ...req.body };
    await guardarJSON('reservas', reservas, shaReservas);
    res.json(reservas[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar reserva' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const reservasData = await leerJSON('reservas', true);
    if (!reservasData) return res.status(500).json({ error: 'Error leyendo reservas' });
    const reservas = reservasData.data.filter(r => r.id !== req.params.id);
    await guardarJSON('reservas', reservas, reservasData.sha);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar reserva' });
  }
});

app.get('/api/credenciales', async (req, res) => {
  try {
    const data = await leerJSON('credenciales');
    res.json(data ? data.data : []);
  } catch (error) {
    res.status(500).json({ error: 'Error al leer credenciales' });
  }
});

app.post('/api/credenciales', async (req, res) => {
  try {
    const actual = await leerJSON('credenciales', true);
    const lista = actual ? actual.data : [];
    const sha = actual ? actual.sha : null;
    const nueva = { ...req.body, id: Date.now().toString() };
    lista.push(nueva);
    await guardarJSON('credenciales', lista, sha);
    res.status(201).json(nueva);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear credencial' });
  }
});

app.put('/api/credenciales/:id', async (req, res) => {
  try {
    const actual = await leerJSON('credenciales', true);
    const lista = actual ? actual.data : [];
    const sha = actual ? actual.sha : null;
    const index = lista.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Credencial no encontrada' });
    lista[index] = { ...lista[index], ...req.body };
    await guardarJSON('credenciales', lista, sha);
    res.json(lista[index]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar credencial' });
  }
});

app.delete('/api/credenciales/:id', async (req, res) => {
  try {
    const actual = await leerJSON('credenciales', true);
    const lista = actual ? actual.data.filter(c => c.id !== req.params.id) : [];
    const sha = actual ? actual.sha : null;
    await guardarJSON('credenciales', lista, sha);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar credencial' });
  }
});

app.get('/api/config', async (req, res) => {
  try {
    const data = await leerJSON('config');
    res.json(data ? data.data : {});
  } catch (error) {
    res.status(500).json({ error: 'Error al leer configuración' });
  }
});

app.put('/api/config', async (req, res) => {
  try {
    const actual = await leerJSON('config', true);
    const sha = actual ? actual.sha : null;
    await guardarJSON('config', req.body, sha);
    res.json({ mensaje: 'Configuración actualizada', config: req.body });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// ==========================================
// ARRANCAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
inicializarDatos().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor Viajes Perdomos en puerto ${PORT}`));
});
