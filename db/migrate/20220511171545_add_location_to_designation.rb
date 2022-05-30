class AddLocationToDesignation < ActiveRecord::Migration[5.2]
  def change
    add_column :designations, :location, :string
  end
end
