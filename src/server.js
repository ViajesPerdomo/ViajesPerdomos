import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' })); // Aumentado para fotos de choferes y guaguas
app.use(express.static(path.join(__dirname, '../public')));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// Ampliación de la caché para incluir las nuevas entidades
const cache = { 
  guaguas: null, 
  reservas: null, 
  usuarios: null, 
  credenciales: null, 
  config: null, 
  valoraciones: null,
  origenes: null,
  destinos: null,
  choferes: null,
  notificaciones: null
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
  if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
  return res;
};

async function leerJSON(nombreArchivo, forzarRecarga = false) {
  try {
    if (cache[nombreArchivo] && !forzarRecarga) return cache[nombreArchivo];
    const res = await githubApi(`${nombreArchivo}.json?ref=${GITHUB_BRANCH}`);
    if (res.status === 404) return null; 
    const data = await res.json();
    const contenido = Buffer.from(data.content, 'base64').toString('utf8');
    const resultado = { data: JSON.parse(contenido), sha: data.sha };
    cache[nombreArchivo] = resultado;
    return resultado;
  } catch (error) {
    if (cache[nombreArchivo]) return cache[nombreArchivo];
    throw error; 
  }
}

async function guardarJSON(nombreArchivo, contenidoJSON, shaExistente = null) {
  try {
    const body = {
      message: `Actualizar ${nombreArchivo}.json`,
      content: Buffer.from(JSON.stringify(contenidoJSON, null, 2)).toString('base64'),
      branch: GITHUB_BRANCH
    };
    if (shaExistente) body.sha = shaExistente;
    const res = await githubApi(`${nombreArchivo}.json`, { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Error guardando en GitHub');
    const nuevoContenido = await leerJSON(nombreArchivo, true);
    cache[nombreArchivo] = nuevoContenido;
    return true;
  } catch (error) {
    throw error;
  }
}

async function inicializarDatos() {
  try {
    console.log("🔄 Iniciando comprobación de datos...");
    if (!await leerJSON('guaguas')) await guardarJSON('guaguas', []);
    if (!await leerJSON('reservas')) await guardarJSON('reservas', []);
    if (!await leerJSON('usuarios')) await guardarJSON('usuarios', []);
    if (!await leerJSON('credenciales')) await guardarJSON('credenciales', []);
    if (!await leerJSON('valoraciones')) await guardarJSON('valoraciones', []);
    if (!await leerJSON('origenes')) await guardarJSON('origenes', ['La Habana', 'Santiago de Cuba', 'Varadero', 'Holguín', 'Trinidad']);
    if (!await leerJSON('destinos')) await guardarJSON('destinos', ['La Habana', 'Santiago de Cuba', 'Varadero', 'Holguín', 'Trinidad']);
    if (!await leerJSON('choferes')) await guardarJSON('choferes', []);
    if (!await leerJSON('notificaciones')) await guardarJSON('notificaciones', []);
    
    let configData = await leerJSON('config');
    if (!configData) {
      await guardarJSON('config', { 
        nombreApp: 'Viajes Perdomo', icono: '🚌', color: '#0f766e', imagenHero: '',
        heroTitulo: 'Viaja cómodo por Cuba', heroSubtitulo: 'Guaguas Yutong con A/C y WiFi.',
        faqs: [{ pregunta: '¿Cómo puedo pagar mi reserva?', respuesta: 'El pago se realiza directamente al abordar la guagua, en efectivo (CUP).' }],
      });
    }
    console.log("🎉 Inicialización completada.");
  } catch (error) {
    console.error("⚠️ Error crítico inicializando datos:", error.message);
  }
}

// ==========================================
// ENDPOINTS: AUTENTICACIÓN Y USUARIOS
// ==========================================
app.get('/api/gestores', async (req, res) => {
  try {
    const data = await leerJSON('credenciales');
    const credenciales = data ? data.data : [];
    const gestores = credenciales.filter(c => c.rol === 'gestor').map(c => ({ usuario: c.usuario, nombre: c.nombre }));
    res.json(gestores);
  } catch (error) { res.status(500).json({ error: 'Error al leer gestores' }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password, gestorCodigo } = req.body;
    if (!gestorCodigo) return res.status(400).json({ error: 'Debes seleccionar un gestor' });
    const data = await leerJSON('usuarios', true);
    const usuarios = data ? data.data : [];
    const sha = data ? data.sha : null;
    if (usuarios.find(u => u.email === email)) return res.status(400).json({ error: 'Correo registrado' });
    const nuevoUsuario = { id: Date.now().toString(), nombre, email, password, gestorCodigo };
    usuarios.push(nuevoUsuario);
    await guardarJSON('usuarios', usuarios, sha);
    res.status(201).json({ mensaje: 'Usuario creado', usuario: nuevoUsuario });
  } catch (error) { res.status(500).json({ error: 'Error al registrar' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const data = await leerJSON('usuarios');
    const usuarios = data ? data.data : [];
    const usuario = usuarios.find(u => u.email === email && u.password === password);
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ mensaje: 'Login exitoso', usuario });
  } catch (error) { res.status(500).json({ error: 'Error al iniciar sesión' }); }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const data = await leerJSON('usuarios');
    res.json(data ? data.data : []);
  } catch (error) { res.status(500).json({ error: 'Error al leer usuarios' }); }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const actual = await leerJSON('usuarios', true);
    const lista = actual ? actual.data : [];
    const sha = actual ? actual.sha : null;
    if (lista.find(u => u.email === req.body.email)) return res.status(400).json({ error: 'Correo ya registrado' });
    const nuevo = { ...req.body, id: Date.now().toString() };
    lista.push(nuevo);
    await guardarJSON('usuarios', lista, sha);
    res.status(201).json(nuevo);
  } catch (error) { res.status(500).json({ error: 'Error al crear usuario' }); }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const actual = await leerJSON('usuarios', true);
    const lista = actual ? actual.data : [];
    const sha = actual ? actual.sha : null;
    const index = lista.findIndex(u => u.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    lista[index] = { ...lista[index], ...req.body };
    await guardarJSON('usuarios', lista, sha);
    res.json(lista[index]);
  } catch (error) { res.status(500).json({ error: 'Error al actualizar usuario' }); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    const actual = await leerJSON('usuarios', true);
    const lista = actual ? actual.data.filter(u => u.id !== req.params.id) : [];
    const sha = actual ? actual.sha : null;
    await guardarJSON('usuarios', lista, sha);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Error al eliminar usuario' }); }
});

// ==========================================
// ENDPOINTS: ORÍGENES Y DESTINOS
// ==========================================
app.get('/api/origenes', async (req, res) => {
  const data = await leerJSON('origenes');
  res.json(data ? data.data : []);
});
app.post('/api/origenes', async (req, res) => {
  const actual = await leerJSON('origenes', true);
  const lista = actual ? actual.data : [];
  if (lista.includes(req.body.nombre)) return res.status(400).json({ error: 'Ya existe' });
  lista.push(req.body.nombre);
  await guardarJSON('origenes', lista, actual?.sha);
  res.status(201).json(lista);
});
app.delete('/api/origenes/:nombre', async (req, res) => {
  const actual = await leerJSON('origenes', true);
  let lista = actual ? actual.data.filter(o => o !== req.params.nombre) : [];
  await guardarJSON('origenes', lista, actual?.sha);
  res.json({ ok: true });
});

app.get('/api/destinos', async (req, res) => {
  const data = await leerJSON('destinos');
  res.json(data ? data.data : []);
});
app.post('/api/destinos', async (req, res) => {
  const actual = await leerJSON('destinos', true);
  const lista = actual ? actual.data : [];
  if (lista.includes(req.body.nombre)) return res.status(400).json({ error: 'Ya existe' });
  lista.push(req.body.nombre);
  await guardarJSON('destinos', lista, actual?.sha);
  res.status(201).json(lista);
});
app.delete('/api/destinos/:nombre', async (req, res) => {
  const actual = await leerJSON('destinos', true);
  let lista = actual ? actual.data.filter(d => d !== req.params.nombre) : [];
  await guardarJSON('destinos', lista, actual?.sha);
  res.json({ ok: true });
});

// ==========================================
// ENDPOINTS: CHOFERES
// ==========================================
app.get('/api/choferes', async (req, res) => {
  const data = await leerJSON('choferes');
  res.json(data ? data.data : []);
});

app.post('/api/choferes', async (req, res) => {
  const actual = await leerJSON('choferes', true);
  const lista = actual ? actual.data : [];
  const nuevo = { ...req.body, id: Date.now().toString() };
  lista.push(nuevo);
  await guardarJSON('choferes', lista, actual?.sha);
  res.status(201).json(nuevo);
});

app.put('/api/choferes/:id', async (req, res) => {
  const actual = await leerJSON('choferes', true);
  const lista = actual ? actual.data : [];
  const index = lista.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'No encontrado' });
  lista[index] = { ...lista[index], ...req.body };
  await guardarJSON('choferes', lista, actual?.sha);
  res.json(lista[index]);
});

app.delete('/api/choferes/:id', async (req, res) => {
  const actual = await leerJSON('choferes', true);
  const lista = actual ? actual.data.filter(c => c.id !== req.params.id) : [];
  await guardarJSON('choferes', lista, actual?.sha);
  res.json({ ok: true });
});

// ==========================================
// ENDPOINTS: GUAGUAS
// ==========================================
app.get('/api/guaguas', async (req, res) => {
  try {
    const data = await leerJSON('guaguas');
    res.json(data ? data.data : []);
  } catch (error) { res.status(500).json({ error: 'Error cargando guaguas' }); }
});

app.post('/api/guaguas', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas', true);
    const lista = actual ? actual.data : [];
    const nueva = { ...req.body, id: req.body.placa }; // La placa es el ID
    lista.push(nueva);
    await guardarJSON('guaguas', lista, actual?.sha);
    res.status(201).json(nueva);
  } catch (error) { res.status(500).json({ error: 'Error al crear guagua' }); }
});

app.put('/api/guaguas/:id', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas', true);
    const lista = actual ? actual.data : [];
    const index = lista.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'No encontrada' });
    lista[index] = { ...lista[index], ...req.body };
    await guardarJSON('guaguas', lista, actual?.sha);
    res.json(lista[index]);
  } catch (error) { res.status(500).json({ error: 'Error al actualizar' }); }
});

app.delete('/api/guaguas/:id', async (req, res) => {
  try {
    const actual = await leerJSON('guaguas', true);
    const lista = actual ? actual.data.filter(g => g.id !== req.params.id) : [];
    await guardarJSON('guaguas', lista, actual?.sha);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// ==========================================
// ENDPOINTS: RESERVAS
// ==========================================
app.get('/api/reservas', async (req, res) => {
  try {
    const data = await leerJSON('reservas');
    res.json(data ? data.data : []);
  } catch (error) { res.status(500).json({ error: 'Error cargando reservas' }); }
});

app.post('/api/reservas', async (req, res) => {
  try {
    const { guaguaId, cantidad } = req.body;
    const guaguasData = await leerJSON('guaguas', true);
    if (!guaguasData) return res.status(500).json({ error: 'Error leyendo guaguas' });
    const guaguas = guaguasData.data;
    const gIndex = guaguas.findIndex(g => g.id === guaguaId);
    if (gIndex === -1) return res.status(404).json({ error: 'Guagua no encontrada' });
    if (guaguas[gIndex].asientosDisp < cantidad) return res.status(400).json({ error: 'Sin asientos' });

    const reservasData = await leerJSON('reservas', true);
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
    guaguas[gIndex].asientosDisp -= cantidad;

    await guardarJSON('reservas', reservas, reservasData?.sha);
    await guardarJSON('guaguas', guaguas, guaguasData.sha);
    res.status(201).json(nuevaReserva);
  } catch (error) { res.status(500).json({ error: 'Error al procesar reserva' }); }
});

app.put('/api/reservas/:id', async (req, res) => {
  try {
    const reservasData = await leerJSON('reservas', true);
    if (!reservasData) return res.status(500).json({ error: 'Error leyendo reservas' });
    const reservas = reservasData.data;
    const index = reservas.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'No encontrada' });

    const estadoAnterior = reservas[index].estado;
    const estadoNuevo = req.body.estado;

    if (estadoNuevo === 'cancelada' && estadoAnterior !== 'cancelada') {
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
    await guardarJSON('reservas', reservas, reservasData.sha);
    res.json(reservas[index]);
  } catch (error) { res.status(500).json({ error: 'Error al actualizar reserva' }); }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const reservasData = await leerJSON('reservas', true);
    if (!reservasData) return res.status(500).json({ error: 'Error leyendo reservas' });
    const reservas = reservasData.data.filter(r => r.id !== req.params.id);
    await guardarJSON('reservas', reservas, reservasData.sha);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// ==========================================
// ENDPOINTS: NOTIFICACIONES
// ==========================================
app.get('/api/notificaciones', async (req, res) => {
  const data = await leerJSON('notificaciones');
  res.json(data ? data.data : []);
});

app.post('/api/notificaciones', async (req, res) => {
  const actual = await leerJSON('notificaciones', true);
  const lista = actual ? actual.data : [];
  const nueva = { 
    ...req.body, 
    id: Date.now().toString(), 
    fecha: new Date().toISOString(),
    leida: false,
    informada: false
  };
  lista.push(nueva);
  await guardarJSON('notificaciones', lista, actual?.sha);
  res.status(201).json(nueva);
});

app.put('/api/notificaciones/:id', async (req, res) => {
  const actual = await leerJSON('notificaciones', true);
  const lista = actual ? actual.data : [];
  const index = lista.findIndex(n => n.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'No encontrada' });
  lista[index] = { ...lista[index], ...req.body };
  await guardarJSON('notificaciones', lista, actual?.sha);
  res.json(lista[index]);
});

app.delete('/api/notificaciones/:id', async (req, res) => {
  const actual = await leerJSON('notificaciones', true);
  const lista = actual ? actual.data.filter(n => n.id !== req.params.id) : [];
  await guardarJSON('notificaciones', lista, actual?.sha);
  res.json({ ok: true });
});

// ==========================================
// ENDPOINTS: VALORACIONES Y CONFIG
// ==========================================
app.get('/api/valoraciones', async (req, res) => {
  const data = await leerJSON('valoraciones');
  res.json(data ? data.data : []);
});
app.post('/api/valoraciones', async (req, res) => {
  const actual = await leerJSON('valoraciones', true);
  const lista = actual ? actual.data : [];
  const nueva = { ...req.body, id: Date.now().toString(), fecha: new Date().toISOString() };
  lista.push(nueva);
  await guardarJSON('valoraciones', lista, actual?.sha);
  res.status(201).json(nueva);
});

app.get('/api/credenciales', async (req, res) => {
  const data = await leerJSON('credenciales');
  res.json(data ? data.data : []);
});
app.post('/api/credenciales', async (req, res) => {
  const actual = await leerJSON('credenciales', true);
  const lista = actual ? actual.data : [];
  const nueva = { ...req.body, id: Date.now().toString() };
  lista.push(nueva);
  await guardarJSON('credenciales', lista, actual?.sha);
  res.status(201).json(nueva);
});
app.put('/api/credenciales/:id', async (req, res) => {
  const actual = await leerJSON('credenciales', true);
  const lista = actual ? actual.data : [];
  const index = lista.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'No encontrada' });
  lista[index] = { ...lista[index], ...req.body };
  await guardarJSON('credenciales', lista, actual?.sha);
  res.json(lista[index]);
});
app.delete('/api/credenciales/:id', async (req, res) => {
  const actual = await leerJSON('credenciales', true);
  const lista = actual ? actual.data.filter(c => c.id !== req.params.id) : [];
  await guardarJSON('credenciales', lista, actual?.sha);
  res.json({ ok: true });
});

app.get('/api/config', async (req, res) => {
  const data = await leerJSON('config');
  res.json(data ? data.data : {});
});
app.put('/api/config', async (req, res) => {
  const actual = await leerJSON('config', true);
  await guardarJSON('config', req.body, actual?.sha);
  res.json({ mensaje: 'Config actualizada', config: req.body });
});

const PORT = process.env.PORT || 3000;
inicializarDatos().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
});
