# Dossier d'Architecture : Plateforme Hybride Cloud & Middleware

Ce document d'architecture illustre l'intégration entre nos briques d'infrastructure (**Traefik**, **Keycloak**, **RabbitMQ**, **PostgreSQL**, **MS SQL Server**, **Oracle**) et les services managés **AWS** et **Microsoft Azure**.

## 1. Architecture des Composants et Flux Réseau

Le diagramme de boîtes connectées ci-dessous présente le découpage réseau et les interconnexions entre la passerelle d'entrée, le serveur d'identité SSO, le bus de messages et les bases de données :

```arch-box
title: Vue Composants - Ingress Traefik, IAM Keycloak, RabbitMQ & Bases Polyglottes
nodes:
  - id: vpc-prod
    componentRef: aws-vpc
    label: AWS VPC Production (eu-west-1)
    position:
      x: 30
      y: 30
    width: 820
    height: 430
    props:
      cidr: 10.20.0.0/16
  - id: gw-traefik
    componentRef: traefik
    label: Traefik Ingress Proxy
    position:
      x: 65
      y: 185
    props:
      tls: mTLS / Let's Encrypt
      port: "443"
  - id: sso-keycloak
    componentRef: keycloak
    label: Keycloak IAM / OIDC
    position:
      x: 335
      y: 65
    props:
      realm: enterprise-sso
  - id: svc-orders
    componentRef: aws-eks
    label: Order Microservice (EKS)
    position:
      x: 335
      y: 195
    props:
      k8s: "1.30"
  - id: bus-rabbit
    componentRef: rabbitmq
    label: RabbitMQ Broker
    position:
      x: 335
      y: 330
    props:
      vhost: /orders
  - id: db-pg
    componentRef: postgresql
    label: PostgreSQL Orders
    position:
      x: 615
      y: 145
    props:
      version: "16"
      port: "5432"
  - id: db-mssql
    componentRef: mssql
    label: MS SQL Server Billing
    position:
      x: 890
      y: 110
    props:
      edition: Enterprise
      port: "1433"
  - id: db-oracle
    componentRef: oracle
    label: Oracle ERP Core
    position:
      x: 890
      y: 280
    props:
      service: ORCLPROD
      port: "1521"
edges:
  - id: e1
    source: gw-traefik
    target: sso-keycloak
    label: ForwardAuth JWT
    protocol: OIDC/HTTPS
  - id: e2
    source: gw-traefik
    target: svc-orders
    label: Route /api/orders
    protocol: HTTP/2
  - id: e3
    source: svc-orders
    target: db-pg
    label: Read / Write Orders
    protocol: TCP/5432
  - id: e4
    source: svc-orders
    target: bus-rabbit
    label: Publish OrderPlaced
    protocol: AMQP
    style: dashed
    animated: true
  - id: e5
    source: bus-rabbit
    target: db-mssql
    label: Sync Facturation
    protocol: TDS/1433
    style: dashed
  - id: e6
    source: bus-rabbit
    target: db-oracle
    label: Mouvement Stock ERP
    protocol: SQL*Net/1521
    style: dashed
```

## 2. Séquence d'Authentification et de Traitement de Commande

Le diagramme de séquence ci-dessous détaille la chronologie des appels lors de la validation d'une commande par un utilisateur :

```arch-seq
title: Séquence de Validation de Commande (Traefik -> Keycloak -> EKS -> PostgreSQL & RabbitMQ)
participants:
  - id: client
    label: Portail Web
    componentRef: web-app
  - id: traefik
    label: Traefik Proxy
    componentRef: traefik
  - id: keycloak
    label: Keycloak IAM
    componentRef: keycloak
  - id: eks
    label: Service Commandes
    componentRef: aws-eks
  - id: pg
    label: PostgreSQL
    componentRef: postgresql
  - id: rmq
    label: RabbitMQ
    componentRef: rabbitmq
  - id: oracle
    label: Oracle ERP
    componentRef: oracle
items:
  - id: m1
    type: message
    from: client
    to: traefik
    label: POST /api/orders (Bearer JWT)
    protocol: HTTPS
    kind: sync
  - id: m2
    type: message
    from: traefik
    to: keycloak
    label: Introspection du jeton OIDC
    protocol: HTTPS
    kind: sync
  - id: m3
    type: message
    from: keycloak
    to: traefik
    label: 200 OK (Token valide + Rôles)
    kind: reply
  - id: m4
    type: message
    from: traefik
    to: eks
    label: Transmission requête authentifiée
    protocol: gRPC
    kind: sync
  - id: m5
    type: message
    from: eks
    to: pg
    label: INSERT INTO orders
    protocol: SQL/5432
    kind: sync
  - id: b1
    type: block
    blockKind: par
    label: Propagation asynchrone vers RabbitMQ et Oracle ERP
  - id: m6
    type: message
    from: eks
    to: rmq
    label: Publish OrderCreatedEvent
    protocol: AMQP
    kind: async
  - id: m7
    type: message
    from: rmq
    to: oracle
    label: Mise à jour stock ERP
    protocol: SQL*Net
    kind: async
  - id: m8
    type: message
    from: eks
    to: client
    label: 201 Created (Order Confirmation)
    protocol: HTTPS
    kind: reply
```
