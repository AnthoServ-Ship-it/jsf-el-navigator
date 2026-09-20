package com.anthoserv.demo;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class ClienteServiceImpl implements ClienteService {

    @Override
    public void guardar(String nombre) {
        System.out.printf("Cliente guardado: %s%n", nombre);
    }
}
