class AddAssignToJobs < ActiveRecord::Migration[5.2]
  def change
    add_column :jobs, :assign_to, :text
  end
end
