import React from 'react';

export interface ArchSymbolProps {
  symbol: string;
  color?: string;
  size?: number;
  className?: string;
}

/**
 * Registre de symboles vectoriels SVG dédiés pour :
 * - MS SQL Server, Oracle, PostgreSQL
 * - RabbitMQ, Traefik, Keycloak
 * - AWS (VPC, Subnet, EC2, Lambda, EKS, ECS, API Gateway, ALB, CloudFront, Route53, S3, RDS, DynamoDB, ElastiCache, SQS, SNS, EventBridge, IAM)
 * - Azure (Resource Group, VNet, VM, AKS, App Service, Functions, APIM, App Gateway, Front Door, Azure SQL, Cosmos DB, Blob, Redis, Service Bus, Event Grid, Entra ID, Key Vault)
 * - Composants génériques (User, Web, Mobile, Microservice, Cloud, Zone)
 */
export const ArchSymbol: React.FC<ArchSymbolProps> = ({
  symbol,
  color = '#3B82F6',
  size = 28,
  className,
}) => {
  const s = symbol.toLowerCase();

  // Support d'une URL ou Data URI SVG personnalisée
  if (s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://')) {
    return (
      <img
        src={symbol}
        alt="symbol"
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain' }}
      />
    );
  }

  switch (s) {
    // ========================================================================
    // BASES DE DONNÉES : MS SQL SERVER, ORACLE, POSTGRESQL
    // ========================================================================
    case 'mssql':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#CC2927" fillOpacity="0.14" stroke="#CC2927" strokeWidth="1.5" />
          <ellipse cx="18" cy="11" rx="10" ry="4" fill="#CC2927" />
          <path d="M8 11v15c0 2.2 4.5 4 10 4s10-1.8 10-4V11" stroke="#CC2927" strokeWidth="2.2" fill="#CC2927" fillOpacity="0.2" />
          <path d="M8 18c0 2.2 4.5 4 10 4s10-1.8 10-4" stroke="#CC2927" strokeWidth="1.8" />
          <rect x="19" y="22" width="16" height="11" rx="3" fill="#CC2927" />
          <text x="27" y="30" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">SQL</text>
        </svg>
      );

    case 'oracle':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#F80000" fillOpacity="0.12" stroke="#F80000" strokeWidth="1.5" />
          <ellipse cx="20" cy="11" rx="11" ry="4" fill="#F80000" fillOpacity="0.85" />
          <path d="M9 11v17c0 2.2 4.9 4 11 4s11-1.8 11-4V11" fill="#F80000" fillOpacity="0.18" stroke="#F80000" strokeWidth="2" />
          {/* Logo anneau Oracle caractéristique */}
          <rect x="12.5" y="18.5" width="15" height="7" rx="3.5" stroke="#F80000" strokeWidth="2.6" fill="#FFFFFF" />
        </svg>
      );

    case 'postgresql':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#336791" fillOpacity="0.15" stroke="#336791" strokeWidth="1.5" />
          {/* Silhouette éléphant + cylindre PostgreSQL */}
          <path d="M11 14c0-4.5 4-7 9-7s9 2.5 9 7v11c0 3.5-4 6-9 6s-9-2.5-9-6V14z" fill="#336791" fillOpacity="0.25" stroke="#336791" strokeWidth="2" />
          <path d="M14 13c-3 1-4 4-3 8 1 2.5 3 3 4 1.5M26 13c3 1 4 4 3 8-1 2.5-3 3-4 1.5" stroke="#336791" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 15v12c0 2.5 2.5 3.5 4 2" stroke="#336791" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="17.5" cy="15.5" r="1.3" fill="#336791" />
          <circle cx="22.5" cy="15.5" r="1.3" fill="#336791" />
          <rect x="13" y="25" width="14" height="8" rx="2.5" fill="#336791" />
          <text x="20" y="31" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">PG</text>
        </svg>
      );

    // ========================================================================
    // MESSAGING, PROXY & IAM : RABBITMQ, TRAEFIK, KEYCLOAK
    // ========================================================================
    case 'rabbitmq':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#FF6600" fillOpacity="0.14" stroke="#FF6600" strokeWidth="1.5" />
          {/* Emblème RabbitMQ officiel stylisé */}
          <path
            d="M11 9h5v9h4V9h5v9h4a2 2 0 012 2v11a2 2 0 01-2 2H11a2 2 0 01-2-2V11a2 2 0 012-2z"
            fill="#FF6600"
          />
          <circle cx="24.5" cy="25.5" r="2.6" fill="#FFFFFF" />
        </svg>
      );

    case 'traefik':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#24A1C1" fillOpacity="0.15" stroke="#24A1C1" strokeWidth="1.5" />
          {/* Hexagone & routes Traefik */}
          <polygon points="20,6 32,13 32,27 20,34 8,27 8,13" fill="#24A1C1" fillOpacity="0.22" stroke="#24A1C1" strokeWidth="2" />
          <path d="M12 20h16M20 12l8 8-8 8" stroke="#24A1C1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="13" cy="15" r="2" fill="#24A1C1" />
          <circle cx="13" cy="25" r="2" fill="#24A1C1" />
        </svg>
      );

    case 'keycloak':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#008AAA" fillOpacity="0.15" stroke="#008AAA" strokeWidth="1.5" />
          {/* Bouclier IAM + Clé Keycloak */}
          <path
            d="M20 6l12 4.5v9c0 7.5-5.2 12.8-12 15-6.8-2.2-12-7.5-12-15v-9L20 6z"
            fill="#008AAA"
            fillOpacity="0.25"
            stroke="#008AAA"
            strokeWidth="2"
          />
          <circle cx="20" cy="17" r="3.5" stroke="#008AAA" strokeWidth="2.3" fill="#FFFFFF" />
          <path d="M20 20.5v7M20 24.5h3M20 27h2.5" stroke="#008AAA" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      );

    case 'spiffworkflow':
    case 'spiff-workflow':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#0D9488" fillOpacity="0.14" stroke="#0D9488" strokeWidth="1.5" />
          {/* Diagramme BPMN : événement début -> losange passerelle -> activités */}
          <circle cx="9.5" cy="20" r="3" fill="#0D9488" />
          <polygon points="20,13 26,20 20,27 14,20" fill="#0D9488" fillOpacity="0.25" stroke="#0D9488" strokeWidth="2" />
          <rect x="28" y="10" width="6" height="6" rx="1.5" fill="#0D9488" />
          <rect x="28" y="24" width="6" height="6" rx="1.5" fill="#0D9488" />
          <path d="M12.5 20h1.5M23 16.5l5-3.5M23 23.5l5 3.5" stroke="#0D9488" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case 'worker':
    case 'workers':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#D97706" fillOpacity="0.14" stroke="#D97706" strokeWidth="1.5" />
          {/* Engrenage de traitement asynchrone Worker */}
          <circle cx="20" cy="20" r="6" fill="#D97706" fillOpacity="0.25" stroke="#D97706" strokeWidth="2.2" />
          <circle cx="20" cy="20" r="2.2" fill="#D97706" />
          <path
            d="M20 9v3M20 28v3M9 20h3M28 20h3M12.2 12.2l2.1 2.1M25.7 25.7l2.1 2.1M27.8 12.2l-2.1 2.1M14.3 25.7l-2.1 2.1"
            stroke="#D97706"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'web-service':
    case 'web-services':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="8" fill="#2563EB" fillOpacity="0.14" stroke="#2563EB" strokeWidth="1.5" />
          {/* Globe réseau + balises API Web Service */}
          <circle cx="20" cy="18" r="9.5" stroke="#2563EB" strokeWidth="2" fill="#2563EB" fillOpacity="0.12" />
          <ellipse cx="20" cy="18" rx="4.5" ry="9.5" stroke="#2563EB" strokeWidth="1.6" />
          <line x1="10.5" y1="18" x2="29.5" y2="18" stroke="#2563EB" strokeWidth="1.6" />
          <rect x="10" y="26" width="20" height="8" rx="2.5" fill="#2563EB" />
          <text x="20" y="31.8" textAnchor="middle" fill="#FFFFFF" fontSize="6" fontWeight="bold" fontFamily="sans-serif">WS/API</text>
        </svg>
      );

    // ========================================================================
    // COMPOSANTS AWS
    // ========================================================================
    case 'aws-vpc':
    case 'aws-subnet':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="7" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.8" strokeDasharray="4 2" />
          <path d="M13 24h14a4 4 0 00.5-7.9A5.5 5.5 0 0017 14a4.5 4.5 0 00-4 10z" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.2" />
          <text x="20" y="34" textAnchor="middle" fill={color} fontSize="7" fontWeight="bold" fontFamily="sans-serif">VPC</text>
        </svg>
      );

    case 'aws-lambda':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#ED7100" />
          {/* Symbole Lambda λ */}
          <path d="M13 29l6.5-14M16 11h3.5l7.5 18h-3.5" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'aws-ec2':
    case 'aws-ecs':
    case 'aws-eks':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#ED7100" />
          <rect x="11" y="11" width="18" height="18" rx="2.5" stroke="#FFFFFF" strokeWidth="2.2" />
          <path d="M15 8v3M20 8v3M25 8v3M15 29v3M20 29v3M25 29v3M8 15h3M8 20h3M8 25h3M29 15h3M29 20h3M29 25h3" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          <text x="20" y="22.5" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">
            {s.replace('aws-', '').toUpperCase()}
          </text>
        </svg>
      );

    case 'aws-s3':
    case 'aws-rds':
    case 'aws-dynamodb':
    case 'aws-elasticache':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill={color} />
          <ellipse cx="20" cy="12" rx="9" ry="3.5" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M11 12v15c0 2 4 3.5 9 3.5s9-1.5 9-3.5V12" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M11 19.5c0 2 4 3.5 9 3.5s9-1.5 9-3.5" stroke="#FFFFFF" strokeWidth="1.6" />
          <text x="20" y="29" textAnchor="middle" fill="#FFFFFF" fontSize="5.8" fontWeight="bold" fontFamily="sans-serif">
            {s.replace('aws-', '').slice(0, 4).toUpperCase()}
          </text>
        </svg>
      );

    case 'aws-sqs':
    case 'aws-sns':
    case 'aws-eventbridge':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#E7157B" />
          <rect x="9" y="13" width="22" height="14" rx="3" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M14 16v8M20 16v8M26 16v8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'aws-apigw':
    case 'aws-alb':
    case 'aws-cloudfront':
    case 'aws-route53':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#8C4FFF" />
          <circle cx="13" cy="20" r="3" fill="#FFFFFF" />
          <circle cx="27" cy="13" r="3" fill="#FFFFFF" />
          <circle cx="27" cy="27" r="3" fill="#FFFFFF" />
          <path d="M16 19l8-5M16 21l8 5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );

    case 'aws-iam':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#DD344C" />
          <path d="M20 9l10 4v7c0 6-4.2 10.2-10 12-5.8-1.8-10-6-10-12v-7l10-4z" stroke="#FFFFFF" strokeWidth="2.2" />
          <path d="M16 20l3 3 5-6" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    // ========================================================================
    // COMPOSANTS MICROSOFT AZURE
    // ========================================================================
    case 'azure-rg':
    case 'azure-vnet':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="2" y="2" width="36" height="36" rx="7" fill="#0078D4" fillOpacity="0.14" stroke="#0078D4" strokeWidth="1.8" strokeDasharray="4 2" />
          <path d="M14 12l-6 8 6 8M26 12l6 8-6 8" stroke="#0078D4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="20" r="3" fill="#0078D4" />
        </svg>
      );

    case 'azure-sql':
    case 'azure-cosmosdb':
    case 'azure-blob':
    case 'azure-redis':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill={color} />
          <ellipse cx="20" cy="11.5" rx="9.5" ry="3.5" fill="#FFFFFF" fillOpacity="0.3" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M10.5 11.5v16c0 2 4.2 3.5 9.5 3.5s9.5-1.5 9.5-3.5v-16" stroke="#FFFFFF" strokeWidth="2" />
          <text x="20" y="25" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">
            {s === 'azure-sql' ? 'SQL' : s.replace('azure-', '').slice(0, 4).toUpperCase()}
          </text>
        </svg>
      );

    case 'azure-functions':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#F59E0B" />
          <polygon points="22,8 12,22 20,22 18,32 28,18 20,18" fill="#FFFFFF" />
        </svg>
      );

    case 'azure-entraid':
    case 'azure-keyvault':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill={color} />
          <polygon points="20,8 31,26 20,32 9,26" stroke="#FFFFFF" strokeWidth="2" fill="#FFFFFF" fillOpacity="0.2" />
          <circle cx="20" cy="19" r="3" fill="#FFFFFF" />
        </svg>
      );

    case 'azure-vm':
    case 'azure-aks':
    case 'azure-appservice':
    case 'azure-apim':
    case 'azure-appgw':
    case 'azure-frontdoor':
    case 'azure-servicebus':
    case 'azure-eventgrid':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="7" fill="#0078D4" />
          {/* Aile stylisée Azure + badge */}
          <path d="M18 9l-8 19h5.5l4.5-11 3.5 8.5-4.5 2.5h11L23 9h-5z" fill="#FFFFFF" />
        </svg>
      );

    // ========================================================================
    // COMPOSANTS GÉNÉRIQUES & ACTEURS
    // ========================================================================
    case 'user-actor':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <circle cx="20" cy="20" r="18" fill={color} fillOpacity="0.14" stroke={color} strokeWidth="1.8" />
          <circle cx="20" cy="14" r="5" stroke={color} strokeWidth="2.2" />
          <path d="M10 31c1.8-5 5-7.5 10-7.5s8.2 2.5 10 7.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );

    case 'web-app':
    case 'mobile-app':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="6" width="34" height="28" rx="5" fill={color} fillOpacity="0.14" stroke={color} strokeWidth="2" />
          <line x1="3" y1="13" x2="37" y2="13" stroke={color} strokeWidth="1.8" />
          <circle cx="8" cy="9.5" r="1.2" fill={color} />
          <circle cx="12" cy="9.5" r="1.2" fill={color} />
          <path d="M15 20l-3 3.5 3 3.5M25 20l3 3.5-3 3.5M21.5 19l-3 9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    default:
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
          <rect x="3" y="3" width="34" height="34" rx="8" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
          <polygon points="20,9 30,14.5 30,25.5 20,31 10,25.5 10,14.5" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.22" />
          <circle cx="20" cy="20" r="3" fill={color} />
        </svg>
      );
  }
};
