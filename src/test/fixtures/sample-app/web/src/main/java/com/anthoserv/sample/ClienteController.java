package com.anthoserv.sample;

import javax.ejb.EJB;
import javax.faces.bean.ManagedBean;

@ManagedBean(name = "clienteController")
public class ClienteController {

    @EJB(lookup = "java:global/sample-service/ClienteServiceImpl!com.anthoserv.sample.ClienteService")
    private ClienteService servicio;

    /** Guarda el cliente desde la vista JSF. */
    public void guardar() {
        validarExistenteCorreo(obtenerCorreo());
        servicio.guardar("Anthoserv");
    }

    /**
     * Comprueba si el correo puede utilizarse.
     *
     * @param correo correo que se desea comprobar
     * @return true cuando el correo es válido
     */
    public boolean validarExistenteCorreo(Object correo) {
        // Método local para probar F12 y Ctrl+clic dentro del controller.
        return correo != null;
    }

    public Object obtenerCorreo() {
        return new Object();
    }

    public java.util.List<TicketRow> getFilas() {
        return java.util.Collections.emptyList();
    }
}
