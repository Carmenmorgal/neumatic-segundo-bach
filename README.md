# NeumaSim · Simulador de circuitos neumáticos

Simulador web de circuitos neumáticos pensado para **Tecnología e Ingeniería de 1º de Bachillerato**, inspirado en FluidSIM. Funciona en cualquier navegador moderno, sin instalar nada y sin servidor: es una página estática lista para **GitHub Pages**.

## Qué incluye

- **Editor de esquemas** con símbolos normalizados (ISO 1219 simplificados): arrastrar y soltar, mover, girar, borrar, deshacer/rehacer, tubos con codos y derivaciones.
- **Componentes**: fuente de aire, unidad de mantenimiento, cilindros de simple y doble efecto, válvulas 3/2 NC y NA (pulsador, palanca, rodillo, pilotada), 5/2 (pulsador, palanca, pilotada monoestable y biestable), temporizador neumático, válvula selectora (O), de simultaneidad (Y), antirretorno, estrangulador, regulador de caudal unidireccional y manómetro.
- **Simulación** con presiones, caudales y movimiento de los cilindros: los tubos se colorean según la presión, las válvulas desplazan sus casillas como en FluidSIM y los reguladores de caudal cambian de verdad la velocidad.
- **Finales de carrera** (a0, a1, b0, b1…) que se accionan solos cuando el cilindro llega a la posición.
- **Diagrama espacio-tiempo** de todos los cilindros en tiempo real.
- **9 ejemplos** de clase: mando directo e indirecto, funciones O e Y, regulación de velocidad, ciclo automático, temporización y la secuencia A+ B+ A− B−.
- Guardar/abrir circuitos (`.json`), exportar imagen PNG y **compartir por enlace** (el circuito va dentro de la URL: ideal para mandar ejercicios al alumnado).
- Guardado automático en el navegador.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `neumasim`).
2. Sube todo el contenido de esta carpeta a la raíz del repositorio (`index.html` debe quedar en la raíz):
   ```bash
   git init
   git add .
   git commit -m "NeumaSim"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/neumasim.git
   git push -u origin main
   ```
   (También vale arrastrar los archivos en la web de GitHub con «Add file → Upload files».)
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
4. En uno o dos minutos estará en `https://TU_USUARIO.github.io/neumasim/`.

El archivo `.nojekyll` evita que GitHub procese la web con Jekyll. No hay dependencias ni paso de compilación.

> También funciona abriendo `index.html` directamente desde el disco (doble clic), útil en aulas sin conexión.

## Estructura

```
index.html          Página principal
css/style.css       Estilos
js/components.js    Símbolos y comportamiento de cada componente
js/sim.js           Motor de simulación
js/examples.js      Circuitos de ejemplo
js/app.js           Editor, interfaz, archivos y diagrama
```

### Añadir un ejemplo propio

La forma más fácil: monta el circuito, pulsa **Compartir** y reparte el enlace. Si prefieres incluirlo en la lista de ejemplos, añade una entrada en `js/examples.js` siguiendo el patrón de las existentes.

## Sobre el modelo físico

Cada grupo de conexiones unidas por tubos es una «red» con volumen y masa de aire. Las válvulas abiertas se comportan como conductancias; los escapes libres ventilan a la atmósfera; las cámaras de los cilindros cambian de volumen al moverse y el émbolo avanza según la diferencia de fuerzas (presión × superficie, muelle, carga y rozamiento). Es un modelo didáctico: el comportamiento cualitativo es realista, pero los tiempos no corresponden a un cilindro concreto.

## Licencia

MIT: úsalo, modifícalo y compártelo libremente en tus clases.
