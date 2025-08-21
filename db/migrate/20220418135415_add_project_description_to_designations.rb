class AddProjectDescriptionToDesignations < ActiveRecord::Migration[5.2]
  def change
    add_column :designations, :project_description, :text
    add_column :designations, :job_description, :text
  end
end
