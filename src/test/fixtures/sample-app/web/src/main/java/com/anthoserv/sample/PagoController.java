package com.anthoserv.sample;

import javax.inject.Inject;
import javax.inject.Qualifier;

public class PagoController {
    private final PagoService servicio;

    @Inject
    public PagoController(@Qualifier("internacional") PagoService servicio) {
        this.servicio = servicio;
    }

    public void pagar() {
        servicio.procesar();
    }
}
