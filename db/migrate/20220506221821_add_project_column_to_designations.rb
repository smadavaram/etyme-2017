class AddProjectColumnToDesignations < ActiveRecord::Migration[5.2]
  def change
    add_column :designations, :project_name, :string
  end
end
