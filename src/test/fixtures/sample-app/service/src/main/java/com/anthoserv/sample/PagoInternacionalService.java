package com.anthoserv.sample;

import javax.inject.Named;

@Named("internacional")
public class PagoInternacionalService implements PagoService {

    @Override
    public void procesar() {
        // Implementación internacional seleccionada por el calificador.
    }
}
