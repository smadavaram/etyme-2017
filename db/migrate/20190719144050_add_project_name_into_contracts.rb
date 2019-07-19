class AddProjectNameIntoContracts < ActiveRecord::Migration[5.1]
  def change
    add_column :contracts, :project_name, :string
  end
end
