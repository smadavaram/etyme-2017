class AddNatureOfWorkToDesignation < ActiveRecord::Migration[5.2]
  def change
    add_column :designations, :nature_of_work, :string
  end
end
