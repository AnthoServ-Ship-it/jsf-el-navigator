package com.anthoserv.sample;

import javax.inject.Named;

@Named("local")
public class PagoLocalService implements PagoService {

    @Override
    public void procesar() {
        // Implementación local para probar calificadores.
    }
}
