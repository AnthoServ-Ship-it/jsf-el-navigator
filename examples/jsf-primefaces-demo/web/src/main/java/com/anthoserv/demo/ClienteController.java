package com.anthoserv.demo;

import jakarta.faces.view.ViewScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import java.io.Serializable;

@Named
@ViewScoped
public class ClienteController implements Serializable {
    private static final long serialVersionUID = 1L;

    private final ClienteService clienteService;
    private String nombre;

    @Inject
    public ClienteController(ClienteService clienteService) {
        this.clienteService = clienteService;
    }

    public void guardar() {
        clienteService.guardar(nombre);
    }

    public String getNombre() {
        return nombre;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }
}
