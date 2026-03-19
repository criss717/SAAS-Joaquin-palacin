# 🏗️ Joaquin Palacin Project Manager

Una plataforma de gestión de proyectos industrial y logística de alto rendimiento, diseñada para la máxima eficiencia en el seguimiento de ensambles, piezas y tiempos.

![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css)

---

## 🚀 Funcionalidades Principales

### 📋 Tablero Kanban Avanzado
*   **Gestión de Sub-tareas**: Seguimiento detallado de piezas dentro de grandes ensambles con barras de progreso reactivas.
*   **Drag & Drop Fluido**: Movimiento intuitivo de tareas entre etapas con sincronización de estado automática.
*   **Filtros Inteligentes**: Buscador integrado y filtrado por estado operativo en tiempo real.
*   **Creación Contextual**: Botones rápidos por columna que pre-seleccionan la etapa del flujo.

### 📊 Diagrama de Gantt Dinámico (Estilo Odoo)
*   **Agrupación Multifactor**: Visualiza el cronograma agrupado por **Etapa**, **Estado** o **Operario Responsable**.
*   **Interacción Directa**: Modifica fechas arrastrando barras de tareas o ensambles directamente en el diagrama.
*   **Sincronización Total**: Cualquier cambio en el Kanban (marcar como listo, cambiar progreso) se refleja al instante en el Gantt.
*   **Diseño Optimizado**: Interfaz limpia que prioriza el área de tiempo, ocultando columnas innecesarias y centrando los datos clave.

### 🛡️ Seguridad y Arquitectura
*   **Stack Moderno**: Implementado sobre **Next.js 15 App Router** y **React 19**.
*   **Acciones Seguras**: Validación de esquemas con **Zod** en todas las Server Actions.
*   **Base de Datos Robusta**: Integración con PostgreSQL mediante **Prisma ORM**.
*   **UI Premium**: Componentes de alta calidad con **Shadcn UI** y **Tailwind CSS v4**.

---

## 🛠️ Instalación y Configuración

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/criss717/SAAS-Joaquin-palacin.git
    cd SAAS-Joaquin-palacin
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar variables de entorno:**
    Crea un archivo `.env` en la raíz (usa `.env.example` como guía):
    ```env
    DATABASE_URL="vuestra-url-de-base-de-datos"
    ```

4.  **Preparar la base de datos:**
    ```bash
    npx prisma generate
    npx prisma db push
    ```

5.  **Ejecutar en desarrollo:**
    ```bash
    npm run dev
    ```

---

## 👨‍💻 Desarrollo

El proyecto sigue estándares de **Código Limpio** y **Seguridad (OWASP)**. Las contribuciones deben mantener el tipado estricto de TypeScript y la arquitectura de componentes del servidor.

---
*Desarrollado con ❤️ para Joaquin Palacin.*
