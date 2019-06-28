class CreatePlugins < ActiveRecord::Migration[5.1]
  def change
    unless table_exists? :plugins
      create_table :plugins do |t|
        t.string :expires_at
        t.string :user_name
        t.string :access_token
        t.string :refresh_token
        t.string :account_id
        t.string :account_name
        t.string :base_path
        t.integer :plugin_type
        t.integer :company_id
        t.timestamps
      end
    end
  end
end