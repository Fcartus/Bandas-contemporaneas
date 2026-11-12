# Prueba 2 · tarima, roles y público con teléfonos reales

Objetivo: comprobar con teléfonos reales lo que el navegador del computador no puede: el reparto de instrumentos con varias personas, el **gesto de lanzar** (sensibilidad) y cómo se comporta la conexión al bloquear o recargar.

Mínimo: **5 teléfonos** (4 músicos + 1 público). Ideal: 6 o más, mezclando iPhone y Android.

## Preparación

1. Laptop y teléfonos en la misma red. Ojo: el hotspot de un teléfono acepta pocos dispositivos (a veces 5–10); con muchos, usa un router WiFi.
2. En la carpeta del proyecto: `node server.js`.
3. En el laptop abre `https://localhost:8443/escenario.html`, acepta el aviso del certificado y pon el navegador en pantalla completa (**F**).
4. Si el QR apunta a una IP equivocada: `$env:HOST_IP="172.20.10.2"; node server.js`.

## En cada teléfono

1. Escanea el QR de la pantalla y acepta el aviso del certificado (iPhone: *Mostrar detalles → visitar este sitio web*; Android: *Avanzado → Continuar*).
2. Escribe tu nombre y **Entrar**. Entren **de a uno**, para ver el orden de llegada.

## Qué probar y anotar

| # | Prueba | Cómo | Qué debería pasar |
|---|---|---|---|
| 1 | Reparto | Entran 4 personas, una por una | Guitarra, bajo, batería, teclado en ese orden; cada teléfono muestra su instrumento |
| 2 | Público | Entra la quinta persona | Su teléfono muestra la mini tarima y la zona de rosa/tomate |
| 3 | Pads | Cada músico toca sus 4 zonas | Su músico se ilumina y salen notas ♪ en la pantalla |
| 4 | Lanzar suave | Deslizar despacio hacia arriba | Cae cerca del borde (le da a guitarra o bajo) |
| 5 | Lanzar fuerte | Deslizar rápido hacia arriba | Llega al fondo (batería o teclado) |
| 6 | Apuntar | Deslizar en diagonal | La línea punteada de la mini tarima marca al músico correcto |
| 7 | Espera | Lanzar dos veces seguidas | El segundo no sale hasta que termina el contador de 5 s |
| 8 | Impacto en el músico | Darle a un músico | Su teléfono se tiñe (rojo tomate / rosado rosa) con el nombre de quien lanzó |
| 9 | Recargar | Un músico recarga la página | Conserva su instrumento |
| 10 | Bloquear | Un músico bloquea la pantalla 20 s | A los 15 s su lugar pasa al público; al volver queda en el público |
| 11 | Liberar | En el panel, **Liberar** a un músico | El primero del público toma su lugar |

**Calibrar el lanzamiento (pruebas 4 a 6):** el panel de la pantalla (tecla **B**) muestra *Último lanzamiento: nombre · tipo · velocidad px/ms · fuerza · a quién*. Anota la velocidad de un lanzamiento suave y uno fuerte de cada persona: con eso se ajusta la fórmula en `banda.html` (`(sp - 0.3) / 2.4`).

## Resultados

| Teléfono y sistema | Rol | 3 Pads | Vel. suave | Vel. fuerte | 6 Apuntar bien | 8 Impacto | 9 Recargar | 10 Bloquear | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |

## Qué decide esto

- **Velocidades muy distintas entre teléfonos:** se normaliza por persona (los primeros lanzamientos calibran) o por tamaño de pantalla.
- **Apuntar es difícil:** se agranda el radio de impacto (`RADIO_IMPACTO` en `banda-comun.js`) o se suma ayuda para apuntar.
- **15 s de gracia es poco o mucho:** se cambia `GRACIA` en `banda-comun.js`.
