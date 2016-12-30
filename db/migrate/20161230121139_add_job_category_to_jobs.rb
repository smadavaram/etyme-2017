class AddJobCategoryToJobs < ActiveRecord::Migration
  def change
    add_column :jobs, :job_category, :string
  end
end
