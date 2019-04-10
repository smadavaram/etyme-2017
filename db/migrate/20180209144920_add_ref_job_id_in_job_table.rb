class AddRefJobIdInJobTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :jobs, :ref_job_id, :integer
    add_column :jobs, :is_bench_job, :boolean, defalut: false
  end
end