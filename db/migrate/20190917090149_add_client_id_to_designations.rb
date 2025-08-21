class AddClientIdToDesignations < ActiveRecord::Migration[5.1]
  def change
    add_column :designations, :client_id, :bigint
  end
end
