class AddJobCategoryToJobs < ActiveRecord::Migration[4.2]
  def change
    add_column :jobs, :job_category, :string
  end
end
