package com.anthoserv.sample;

import javax.ejb.EJB;
import javax.faces.bean.ManagedBean;

@ManagedBean(name = "clienteController")
public class ClienteController {

    @EJB(lookup = "java:global/sample-service/ClienteServiceImpl!com.anthoserv.sample.ClienteService")
    private ClienteService servicio;

    public void guardar() {
        servicio.guardar("Anthoserv");
    }
}
