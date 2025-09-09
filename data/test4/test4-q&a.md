### Q41. What does a Deployment provide declarative updates for?
**A:** Pods and ReplicaSets.  
> *“A Deployment provides declarative updates for Pods and ReplicaSets.”*  

---

### Q42. How does a Deployment move the actual state toward the desired state?
**A:** The controller changes actual to desired at a controlled rate.  
> *“You describe a desired state in a Deployment, and the Deployment controller changes the actual state to the desired state at a controlled rate.”*  

---

### Q43. In the nginx example, how many Pods are created and which field controls that?
**A:** Three Pods, controlled by `.spec.replicas`.  
> *“The Deployment creates a ReplicaSet that creates three replicated Pods, indicated by the `.spec.replicas` field.”*  

---

### Q44. What relationship must `.spec.selector` have to the Pod template labels?
**A:** It must match `.spec.template.metadata.labels`, or the API rejects it.  
> *“.spec.selector must match .spec.template.metadata.labels, or it will be rejected by the API.”*  

---

### Q45. What is the naming format for ReplicaSets created by a Deployment?
**A:** `[DEPLOYMENT-NAME]-[HASH]`.  
> *“Notice that the name of the ReplicaSet is always formatted as `[DEPLOYMENT-NAME]-[HASH]`.”*  

---

### Q46. Should you modify the `pod-template-hash` label?
**A:** No, do not change it; it prevents overlap between child ReplicaSets.  
> *“Do not change this label.”*  

---

### Q47. What specifically triggers a Deployment rollout?
**A:** Changing the Deployment’s Pod template (for example, labels or container images).  
> *“A Deployment’s rollout is triggered if and only if the Deployment’s Pod template (that is, `.spec.template`) is changed… Other updates, such as scaling the Deployment, do not trigger a rollout.”*  

---

### Q48. Are Deployment label selectors mutable in `apps/v1`?
**A:** No, they are immutable after creation.  
> *“In API version `apps/v1`, a Deployment’s label selector is immutable after it gets created.”*  

---

### Q49. What are the default values for `maxUnavailable` and `maxSurge` in a RollingUpdate?
**A:** Both default to 25%.  
> *“The default value is 25%.”*  

---

### Q50. What is the default `revisionHistoryLimit` for a Deployment?
**A:** 10 old ReplicaSets are kept by default.  
> *“By default, it is 10.”*  
