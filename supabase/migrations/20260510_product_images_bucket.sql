-- ============================================================
-- Migration: product-images storage bucket
-- Cria o bucket de imagens de produtos e configura políticas
-- de acesso (upload por loja autenticada, leitura pública)
-- ============================================================

-- 1) Cria o bucket como público (imagens do cardápio devem ser acessíveis sem login)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,                          -- público: qualquer um pode ver as imagens
  2097152,                       -- limite: 2 MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;    -- idempotente: não falha se já existir

-- ============================================================
-- 2) Políticas de Storage
-- ============================================================

-- 2a) Leitura pública (cardápio online, PDV de clientes)
CREATE POLICY "product-images: leitura pública"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

-- 2b) Upload apenas por usuários autenticados (dono da loja)
--     O arquivo deve ser salvo na pasta {store_id}/... onde store_id
--     é o store_id do perfil do usuário autenticado.
CREATE POLICY "product-images: upload autenticado"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      -- O nome do arquivo começa com o store_id do perfil do usuário
      (storage.foldername(name))[1] = (
        SELECT store_id::text
        FROM public.profiles
        WHERE auth_user_id = auth.uid()
        LIMIT 1
      )
    )
  );

-- 2c) Substituição/update de imagem existente (para reedição de produto)
CREATE POLICY "product-images: update autenticado"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (
      SELECT store_id::text
      FROM public.profiles
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );

-- 2d) Deleção apenas pelo dono da loja
CREATE POLICY "product-images: delete autenticado"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (
      SELECT store_id::text
      FROM public.profiles
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
