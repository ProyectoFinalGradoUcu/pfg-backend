#!/bin/sh
# Crea el bucket y el usuario del backend con permisos solo sobre ese bucket. Corre en cada
# deploy y es idempotente: cambiar MINIO_APP_PASSWORD en el .env rota la contraseña.
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "local/$MINIO_BUCKET"

cat > /tmp/politica.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::$MINIO_BUCKET"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::$MINIO_BUCKET/*"]
    }
  ]
}
EOF
mc admin policy create local pfg-backend /tmp/politica.json

mc admin user add local "$MINIO_APP_USER" "$MINIO_APP_PASSWORD"
mc admin policy attach local pfg-backend --user "$MINIO_APP_USER"

echo "MinIO listo: bucket $MINIO_BUCKET, usuario $MINIO_APP_USER"
