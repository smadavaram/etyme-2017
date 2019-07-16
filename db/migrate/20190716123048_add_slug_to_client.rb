class AddSlugToClient < ActiveRecord::Migration[5.1]
  def change
    add_column :clients, :slug_one, :string
    add_column :clients, :slug_two, :string
  end
end
