class CreateIntegrations < ActiveRecord::Migration[5.1]
  def change
    create_table :integrations do |t|
      t.integer :company_id
      t.integer :plugin_id
      t.string  :plugin_type
      t.timestamps
    end
  end
end
