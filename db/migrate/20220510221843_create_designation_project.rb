class CreateDesignationProject < ActiveRecord::Migration[5.2]
  def change
    create_table :designation_projects do |t|
      t.string :project_name
      t.string :client_name
      t.string :location
      t.date :start_date
      t.date :end_date
      t.text :project_description
      t.text :job_description
      t.belongs_to :designation
      t.timestamps
    end
  end
end
