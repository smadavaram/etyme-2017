class CreateRoles < ActiveRecord::Migration[4.2]
  def change
    create_table :roles do |t|
      t.string  :name
      t.integer :company_id
      t.timestamps null: false
    end

    create_table :permissions_roles , id: false do |t|
      t.integer :role_id
      t.integer :permission_id
    end

  end


end
