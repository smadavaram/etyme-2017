class AddApiKeyAndSecretToPlugins < ActiveRecord::Migration[5.1]
  def change
    add_column :plugins, :app_key, :string
    add_column :plugins, :app_secret, :string
  end
end
