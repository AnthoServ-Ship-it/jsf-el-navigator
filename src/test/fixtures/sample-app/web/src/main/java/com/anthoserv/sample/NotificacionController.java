package com.anthoserv.sample;

import javax.inject.Inject;

public class NotificacionController {
    private final NotificacionService servicio;

    @Inject
    public NotificacionController(NotificacionService servicio) {
        this.servicio = servicio;
    }

    public void notificar() {
        servicio.enviar("Anthoserv");
    }
}
