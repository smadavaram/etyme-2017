class CreateCustomFields < ActiveRecord::Migration[4.2]
  def change
    create_table :custom_fields do |t|

      t.string   :name
      t.string   :value
      t.integer  :status
      t.integer  :customizable_id
      t.string   :customizable_type
      t.datetime :created_at
      t.datetime :updated_at

      t.timestamps null: false
    end
  end
end
